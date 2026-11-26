package pl.shopivo.orders;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.catalog.CatalogLookup;
import pl.shopivo.catalog.CatalogLookup.VariantSnapshot;
import pl.shopivo.catalog.Inventory;
import pl.shopivo.catalog.ProductStatus;
import pl.shopivo.catalog.ProductType;
import pl.shopivo.customers.Customers;
import pl.shopivo.orders.OrderModel.Address;
import pl.shopivo.orders.OrderModel.Billing;
import pl.shopivo.orders.OrderModel.PaymentMethod;
import pl.shopivo.orders.OrderModel.PaymentSettingsView;
import pl.shopivo.orders.OrderModel.ShippingMethodView;
import pl.shopivo.orders.OrderModel.ShippingType;
import pl.shopivo.orders.OrderModel.Source;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.usage.UsageRecorder;
import pl.shopivo.stores.Stores;
import pl.shopivo.stores.TaxIds;
import tools.jackson.databind.json.JsonMapper;

/**
 * Turns lines + customer data into an order in one transaction: validates everything server-side (prices come from
 * the catalogue), reserves stock (row-level atomic updates — two customers cannot buy the last item twice), computes
 * totals with VAT, assigns the per-store number and updates the customer record.
 */
@Service
public class OrderPlacement {

    static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]+\\.[^@\\s]{2,}$");
    static final Pattern PL_POSTAL = Pattern.compile("^\\d{2}-\\d{3}$");
    static final Pattern PHONE = Pattern.compile("^\\+?[0-9 ()-]{6,30}$");
    /** Shipping and the COD fee are taxed at the standard rate (simplification documented in ARCHITECTURE.md). */
    static final int SERVICE_VAT_BPS = 2300;

    private final JdbcTemplate jdbc;
    private final CatalogLookup catalog;
    private final Inventory inventory;
    private final ShippingMethods shippingMethods;
    private final PaymentSettings paymentSettings;
    private final Customers customers;
    private final Carts carts;
    private final Stores stores;
    private final List<UsageRecorder> usage;
    private final ApplicationEventPublisher events;
    private final JsonMapper json;
    private final pl.shopivo.content.LegalDocuments legal;
    private final List<OnlinePayments> online;

    OrderPlacement(JdbcTemplate jdbc, CatalogLookup catalog, Inventory inventory, ShippingMethods shippingMethods,
            PaymentSettings paymentSettings, Customers customers, Carts carts, Stores stores, List<UsageRecorder> usage,
            ApplicationEventPublisher events, JsonMapper json, pl.shopivo.content.LegalDocuments legal,
            List<OnlinePayments> online) {
        this.online = online;
        this.legal = legal;
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.inventory = inventory;
        this.shippingMethods = shippingMethods;
        this.paymentSettings = paymentSettings;
        this.customers = customers;
        this.carts = carts;
        this.stores = stores;
        this.usage = usage;
        this.events = events;
        this.json = json;
    }

    public record LineInput(UUID variantId, int quantity) {
    }

    public record CustomerInput(String email, String phone, String firstName, String lastName, Address shippingAddress,
            Billing billing, UUID shippingMethodId, PaymentMethod paymentMethod, String customerNote, boolean termsAccepted,
            boolean marketingConsent) {
    }

    /** {@code publicToken} is shown to the customer once (order status page); only its hash is stored. */
    public record Placed(UUID orderId, long number, String publicToken, long totalMinor, String currency) {
    }

    /** Storefront checkout of a cart (converts it). */
    @Transactional
    public Placed checkout(String cartToken, CustomerInput customer) {
        Carts.CartRow cart = carts.lockOpen(cartToken);
        if (!"OPEN".equals(cart.status())) {
            throw new ConflictException("CART_ALREADY_ORDERED", "To zamówienie zostało już złożone.");
        }
        List<LineInput> lines = carts.items(cart.id()).stream().map(i -> new LineInput(i.variantId(), i.quantity())).toList();
        if (!customer.termsAccepted()) {
            throw new BusinessRuleException("TERMS_REQUIRED", "Zaakceptuj regulamin sklepu.");
        }
        if (customer.paymentMethod() == PaymentMethod.MANUAL) {
            throw new BusinessRuleException("PAYMENT_METHOD_UNAVAILABLE", "Wybierz metodę płatności.");
        }
        Placed placed = place(Source.STOREFRONT, lines, customer, null, true);
        carts.markConverted(cart.id(), placed.orderId());
        return placed;
    }

    /** Order entered by the merchant (phone/e-mail sale). */
    @Transactional
    public Placed manual(List<LineInput> lines, CustomerInput customer, UUID actor) {
        return place(Source.PANEL, lines, customer, actor, false);
    }

    private Placed place(Source source, List<LineInput> rawLines, CustomerInput c, UUID actor, boolean storefront) {
        UUID tenant = TenantContext.requireTenantId();
        Map<UUID, Integer> lines = new LinkedHashMap<>();
        for (LineInput l : rawLines == null ? List.<LineInput>of() : rawLines) {
            if (l.variantId() == null || l.quantity() < 1 || l.quantity() > Carts.MAX_QUANTITY) {
                throw new BusinessRuleException("INVALID_QUANTITY", "Nieprawidłowa ilość.");
            }
            lines.merge(l.variantId(), l.quantity(), Integer::sum);
        }
        if (lines.isEmpty()) throw new BusinessRuleException("EMPTY_ORDER", "Zamówienie nie zawiera produktów.");
        if (lines.size() > Carts.MAX_LINES) throw new BusinessRuleException("TOO_MANY_LINES", "Za dużo pozycji w zamówieniu.");

        String email = require(c.email(), 320, "Podaj adres e-mail.").toLowerCase();
        if (!EMAIL.matcher(email).matches()) throw new BusinessRuleException("INVALID_EMAIL", "Nieprawidłowy adres e-mail.");
        String firstName = require(c.firstName(), 100, "Podaj imię.");
        String lastName = require(c.lastName(), 100, "Podaj nazwisko.");
        String phone = c.phone() == null || c.phone().isBlank() ? null : c.phone().trim();
        if (phone != null && !PHONE.matcher(phone).matches()) throw new BusinessRuleException("INVALID_PHONE", "Nieprawidłowy numer telefonu.");
        String note = c.customerNote() == null || c.customerNote().isBlank() ? null : c.customerNote().strip();
        if (note != null && note.length() > 1000) throw new BusinessRuleException("NOTE_TOO_LONG", "Uwagi mogą mieć najwyżej 1000 znaków.");

        Map<UUID, VariantSnapshot> variants = catalog.variants(lines.keySet());
        boolean grossPrices = stores.currentSettings().pricesIncludeTax();
        boolean physical = false;
        for (UUID id : lines.keySet()) {
            VariantSnapshot v = variants.get(id);
            if (v == null || v.status() == ProductStatus.ARCHIVED || (storefront && v.status() != ProductStatus.ACTIVE)) {
                throw new BusinessRuleException("PRODUCT_UNAVAILABLE", "Jeden z produktów nie jest już dostępny.");
            }
            physical |= v.type() == ProductType.PHYSICAL;
        }

        Address address = physical ? validateAddress(c.shippingAddress(), "dostawy") : null;
        Billing billing = validateBilling(c.billing());
        ShippingMethodView method = null;
        if (physical) {
            if (c.shippingMethodId() == null) throw new BusinessRuleException("SHIPPING_REQUIRED", "Wybierz sposób dostawy.");
            method = shippingMethods.get(c.shippingMethodId());
            if (!method.active() || method.type() == ShippingType.DIGITAL) {
                throw new BusinessRuleException("SHIPPING_UNAVAILABLE", "Wybrany sposób dostawy jest niedostępny.");
            }
        }
        PaymentMethod payment = c.paymentMethod();
        PaymentSettingsView settings = paymentSettings.current();
        if (payment == null) throw new BusinessRuleException("PAYMENT_REQUIRED", "Wybierz metodę płatności.");
        if (storefront && (payment == PaymentMethod.BANK_TRANSFER && !settings.bankTransferEnabled()
                || payment == PaymentMethod.COD && (!settings.codEnabled() || !physical)
                || payment == PaymentMethod.ONLINE && online.stream().noneMatch(o -> o.activeOperatorName().isPresent()))) {
            throw new BusinessRuleException("PAYMENT_METHOD_UNAVAILABLE", "Wybrana metoda płatności jest niedostępna.");
        }

        // Reserve stock line by line (atomic conditional updates).
        UUID orderId = UuidV7.generate();
        long subtotal = 0;
        long tax = 0;
        List<Object[]> items = new ArrayList<>();
        int position = 0;
        for (var e : lines.entrySet()) {
            VariantSnapshot v = variants.get(e.getKey());
            int qty = e.getValue();
            boolean reserved;
            try {
                reserved = v.trackInventory() && inventory.reserve(v.variantId(), qty, v.allowBackorder());
            } catch (BusinessRuleException ex) {
                throw new BusinessRuleException("INSUFFICIENT_STOCK", v.available() == null || v.available() <= 0
                        ? "Produkt „" + v.productName() + "” jest już niedostępny."
                        : "Dostępnych jest tylko " + v.available() + " szt. produktu „" + v.productName() + "”.",
                        Map.of("variantId", v.variantId(), "available", Math.max(v.available() == null ? 0 : v.available(), 0)));
            }
            long unit = grossUnitPrice(v, grossPrices);
            long lineTotal = unit * qty;
            subtotal += lineTotal;
            tax += includedVat(lineTotal, v.vatRateBps());
            items.add(new Object[] {UuidV7.generate(), tenant, orderId, v.productId(), v.variantId(), v.productName(),
                    v.variantTitle().isEmpty() ? null : v.variantTitle(), v.sku(), qty, unit, v.vatRateBps(), lineTotal,
                    reserved ? qty : 0, position++});
        }
        long shipping = method == null ? 0 : ShippingMethods.priceFor(method, subtotal);
        long fee = payment == PaymentMethod.COD ? settings.codFeeMinor() : 0;
        tax += includedVat(shipping, SERVICE_VAT_BPS) + includedVat(fee, SERVICE_VAT_BPS);
        long total = subtotal + shipping + fee;
        String currency = stores.current().defaultCurrency();

        UUID customerId = customers.upsertFromOrder(email, firstName, lastName, phone, c.marketingConsent());
        long number = nextNumber(tenant);
        String token = Tokens.newToken();
        Instant now = Instant.now();
        jdbc.update("""
                insert into orders (id, tenant_id, number, public_token_hash, source, status, payment_status, payment_method, customer_id,
                    email, phone, first_name, last_name, shipping_address_json, billing_json, shipping_method_id, shipping_method_name,
                    shipping_minor, payment_fee_minor, subtotal_minor, total_minor, tax_minor, currency, customer_note, terms_accepted_at,
                    terms_revision_id, created_at, updated_at)
                values (?, ?, ?, ?, ?, 'NEW', 'UNPAID', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, orderId, tenant, number, Tokens.sha256(token), source.name(), payment.name(), customerId, email, phone, firstName,
                lastName, address == null ? null : json.writeValueAsString(address), billing == null ? null : json.writeValueAsString(billing),
                method == null ? null : method.id(), method == null ? null : method.name(), shipping, fee, subtotal, total, tax, currency,
                note, storefront ? Timestamp.from(now) : null,
                storefront ? legal.currentRevision(pl.shopivo.content.LegalKey.TERMS).orElse(null) : null, Timestamp.from(now), Timestamp.from(now));
        jdbc.batchUpdate("""
                insert into order_items (id, tenant_id, order_id, product_id, variant_id, name, variant_title, sku, quantity,
                    unit_price_minor, vat_rate_bps, line_total_minor, reserved_qty, position)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, items);
        Orders.event(jdbc, tenant, orderId, "CREATED", source == Source.PANEL ? "Zamówienie dodane w panelu" : "Zamówienie złożone w sklepie",
                false, actor);
        customers.recordOrder(customerId, 1, total, now);
        usage.forEach(u -> u.record(tenant, "orders", 1));
        events.publishEvent(new OrderEvents.OrderPlaced(tenant, orderId));
        return new Placed(orderId, number, token, total, currency);
    }

    private long nextNumber(UUID tenant) {
        Long n = jdbc.queryForObject("""
                insert into tenant_counters (tenant_id, name, value) values (?, 'order', 1001)
                on conflict (tenant_id, name) do update set value = tenant_counters.value + 1 returning value
                """, Long.class, tenant);
        return n == null ? 1001 : n;
    }

    private static Address validateAddress(Address a, String what) {
        if (a == null) throw new BusinessRuleException("ADDRESS_REQUIRED", "Podaj adres " + what + ".");
        String country = a.countryCode() == null || a.countryCode().isBlank() ? "PL" : a.countryCode().trim().toUpperCase();
        if (!country.matches("[A-Z]{2}")) throw new BusinessRuleException("INVALID_COUNTRY", "Nieprawidłowy kraj.");
        String postal = require(a.postalCode(), 12, "Podaj kod pocztowy.");
        if ("PL".equals(country) && !PL_POSTAL.matcher(postal).matches()) {
            throw new BusinessRuleException("INVALID_POSTAL_CODE", "Kod pocztowy w formacie 00-000.");
        }
        String phone = a.phone() == null || a.phone().isBlank() ? null : a.phone().trim();
        if (phone != null && !PHONE.matcher(phone).matches()) throw new BusinessRuleException("INVALID_PHONE", "Nieprawidłowy numer telefonu.");
        return new Address(require(a.name(), 200, "Podaj odbiorcę przesyłki."), opt(a.company(), 200),
                require(a.line1(), 200, "Podaj ulicę i numer."), opt(a.line2(), 200), postal, require(a.city(), 100, "Podaj miejscowość."),
                country, phone);
    }

    private static Billing validateBilling(Billing b) {
        if (b == null || !b.invoice()) return null;
        String nip = TaxIds.normalizeNip(b.taxId());
        if (!TaxIds.isValidNip(nip)) throw new BusinessRuleException("INVALID_NIP", "Nieprawidłowy NIP.");
        return new Billing(true, require(b.companyName(), 200, "Podaj nazwę firmy."), nip,
                b.address() == null ? null : validateAddress(b.address(), "do faktury"));
    }

    static long grossUnitPrice(VariantSnapshot v, boolean pricesIncludeTax) {
        return pricesIncludeTax ? v.priceMinor() : Math.round(v.priceMinor() * (10_000 + v.vatRateBps()) / 10_000.0);
    }

    static long grossCompareAt(VariantSnapshot v, boolean pricesIncludeTax) {
        long c = v.compareAtMinor();
        return pricesIncludeTax ? c : Math.round(c * (10_000 + v.vatRateBps()) / 10_000.0);
    }

    /** VAT contained in a gross amount (rounded per line). */
    static long includedVat(long gross, int rateBps) {
        return rateBps == 0 ? 0 : Math.round(gross * rateBps / (double) (10_000 + rateBps));
    }

    private static String require(String value, int max, String message) {
        if (value == null || value.isBlank()) throw new BusinessRuleException("FIELD_REQUIRED", message);
        String v = value.trim();
        if (v.length() > max) throw new BusinessRuleException("TOO_LONG", "Wartość jest za długa.");
        return v;
    }

    private static String opt(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String v = value.trim();
        return v.length() > max ? v.substring(0, max) : v;
    }
}

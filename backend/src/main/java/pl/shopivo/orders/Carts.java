package pl.shopivo.orders;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.catalog.CatalogLookup;
import pl.shopivo.catalog.CatalogLookup.VariantSnapshot;
import pl.shopivo.catalog.ProductStatus;
import pl.shopivo.orders.OrderModel.CartLine;
import pl.shopivo.orders.OrderModel.CartView;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.Stores;

/**
 * Storefront carts. A cart is addressed by a random token held by the browser (only its hash is stored); prices and
 * availability are always read from the catalogue, never from the client.
 */
@Service
public class Carts {

    static final int MAX_LINES = 100;
    static final int MAX_QUANTITY = 999;

    private final JdbcTemplate jdbc;
    private final CatalogLookup catalog;
    private final Stores stores;
    private final pl.shopivo.catalog.PublicCatalog cards;

    Carts(JdbcTemplate jdbc, CatalogLookup catalog, Stores stores, pl.shopivo.catalog.PublicCatalog cards) {
        this.cards = cards;
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.stores = stores;
    }

    public record NewCart(String token, CartView cart) {
    }

    record CartRow(UUID id, String status, UUID orderId) {
    }

    record Item(UUID variantId, int quantity) {
    }

    @Transactional
    public NewCart create() {
        String token = Tokens.newToken();
        String currency = stores.current().defaultCurrency();
        jdbc.update("insert into carts (id, tenant_id, token_hash, currency) values (?, ?, ?, ?)", UuidV7.generate(),
                TenantContext.requireTenantId(), Tokens.sha256(token), currency);
        return new NewCart(token, new CartView(currency, List.of(), 0, 0, false));
    }

    @Transactional(readOnly = true)
    public CartView view(String token) {
        return view(open(token).id());
    }

    @Transactional
    public CartView add(String token, UUID variantId, int quantity) {
        CartRow cart = open(token);
        if (quantity < 1 || quantity > MAX_QUANTITY) throw new BusinessRuleException("INVALID_QUANTITY", "Nieprawidłowa ilość.");
        int current = items(cart.id()).stream().filter(i -> i.variantId().equals(variantId)).mapToInt(Item::quantity).findFirst().orElse(0);
        if (current == 0 && items(cart.id()).size() >= MAX_LINES) {
            throw new BusinessRuleException("CART_FULL", "Koszyk może zawierać najwyżej " + MAX_LINES + " pozycji.");
        }
        setQuantity(cart, variantId, Math.min(current + quantity, MAX_QUANTITY));
        return view(cart.id());
    }

    @Transactional
    public CartView update(String token, UUID variantId, int quantity) {
        CartRow cart = open(token);
        if (quantity < 0 || quantity > MAX_QUANTITY) throw new BusinessRuleException("INVALID_QUANTITY", "Nieprawidłowa ilość.");
        if (quantity == 0) {
            jdbc.update("delete from cart_items where cart_id = ? and variant_id = ? and tenant_id = ?", cart.id(), variantId,
                    TenantContext.requireTenantId());
            touch(cart.id());
        } else {
            setQuantity(cart, variantId, quantity);
        }
        return view(cart.id());
    }

    private void setQuantity(CartRow cart, UUID variantId, int quantity) {
        VariantSnapshot v = catalog.variants(List.of(variantId)).get(variantId);
        if (v == null || v.status() != ProductStatus.ACTIVE) {
            throw new NotFoundException("Ten produkt nie jest dostępny.");
        }
        if (!v.canSell(quantity)) {
            throw new BusinessRuleException("INSUFFICIENT_STOCK", v.available() == null || v.available() <= 0
                    ? "Produkt „" + v.productName() + "” jest niedostępny."
                    : "Dostępnych jest tylko " + v.available() + " szt. produktu „" + v.productName() + "”.",
                    Map.of("available", Math.max(v.available() == null ? 0 : v.available(), 0)));
        }
        jdbc.update("""
                insert into cart_items (cart_id, tenant_id, variant_id, quantity) values (?, ?, ?, ?)
                on conflict (cart_id, variant_id) do update set quantity = excluded.quantity
                """, cart.id(), TenantContext.requireTenantId(), variantId, quantity);
        touch(cart.id());
    }

    /** Locks an open cart for checkout. */
    @Transactional
    CartRow lockOpen(String token) {
        List<CartRow> rows = jdbc.query("select id, status, order_id from carts where token_hash = ? and tenant_id = ? for update",
                (rs, i) -> new CartRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, UUID.class)),
                Tokens.sha256(token == null ? "" : token), TenantContext.requireTenantId());
        if (rows.isEmpty()) throw new NotFoundException("Nie znaleziono koszyka.");
        return rows.getFirst();
    }

    List<Item> items(UUID cartId) {
        return jdbc.query("select variant_id, quantity from cart_items where cart_id = ? and tenant_id = ? order by added_at",
                (rs, i) -> new Item(rs.getObject(1, UUID.class), rs.getInt(2)), cartId, TenantContext.requireTenantId());
    }

    void markConverted(UUID cartId, UUID orderId) {
        jdbc.update("update carts set status = 'CONVERTED', order_id = ?, updated_at = now() where id = ? and tenant_id = ?",
                orderId, cartId, TenantContext.requireTenantId());
    }

    private CartRow open(String token) {
        List<CartRow> rows = jdbc.query("select id, status, order_id from carts where token_hash = ? and tenant_id = ?",
                (rs, i) -> new CartRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, UUID.class)),
                Tokens.sha256(token == null ? "" : token), TenantContext.requireTenantId());
        if (rows.isEmpty() || !"OPEN".equals(rows.getFirst().status())) {
            throw new NotFoundException("Nie znaleziono koszyka.");
        }
        return rows.getFirst();
    }

    private void touch(UUID cartId) {
        jdbc.update("update carts set updated_at = now() where id = ?", cartId);
    }

    private CartView view(UUID cartId) {
        List<Item> items = items(cartId);
        Map<UUID, VariantSnapshot> variants = catalog.variants(items.stream().map(Item::variantId).toList());
        boolean grossPrices = stores.currentSettings().pricesIncludeTax();
        List<CartLine> lines = new ArrayList<>();
        long subtotal = 0;
        int count = 0;
        boolean ready = !items.isEmpty();
        String currency = stores.current().defaultCurrency();
        Map<UUID, pl.shopivo.catalog.PublicCatalog.ProductCard> shown = new java.util.HashMap<>();
        for (var c : cards.cards(variants.values().stream().map(VariantSnapshot::productId).distinct().toList())) shown.put(c.id(), c);
        for (Item item : items) {
            VariantSnapshot v = variants.get(item.variantId());
            if (v == null) continue;
            boolean available = v.status() == ProductStatus.ACTIVE && v.canSell(item.quantity());
            long unit = OrderPlacement.grossUnitPrice(v, grossPrices);
            long line = unit * item.quantity();
            lines.add(new CartLine(v.variantId(), v.productId(), v.productName(), v.variantTitle(), v.sku(), item.quantity(), unit,
                    v.compareAtMinor() == null ? null : OrderPlacement.grossCompareAt(v, grossPrices), line, available,
                    v.trackInventory() && !v.allowBackorder() ? v.available() : null,
                    shown.containsKey(v.productId()) ? shown.get(v.productId()).slug() : null,
                    shown.containsKey(v.productId()) ? shown.get(v.productId()).imageUrl() : null,
                    shown.containsKey(v.productId()) ? shown.get(v.productId()).imageColor() : null));
            if (available) {
                subtotal += line;
                count += item.quantity();
            } else {
                ready = false;
            }
        }
        return new CartView(currency, lines, count, subtotal, ready);
    }
}

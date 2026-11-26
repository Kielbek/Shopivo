package pl.shopivo.orders.internal;

import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.email.EmailMessage;
import pl.shopivo.email.EmailSender;
import pl.shopivo.email.EmailTemplates;
import pl.shopivo.orders.OrderEvents;
import pl.shopivo.orders.OrderModel.OrderView;
import pl.shopivo.orders.OrderModel.PaymentMethod;
import pl.shopivo.orders.OrderModel.PaymentStatus;
import pl.shopivo.orders.OrderModel.PaymentSettingsView;
import pl.shopivo.orders.Orders;
import pl.shopivo.orders.PaymentSettings;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.Stores;

/** Order e-mails to the customer and the store, sent asynchronously after commit in the tenant's context. */
@Component
class OrderMailer {

    private final Orders orders;
    private final Stores stores;
    private final PaymentSettings payments;
    private final EmailTemplates templates;
    private final EmailSender sender;
    private final ShopivoProperties properties;
    private final TransactionTemplate tx;
    private final org.springframework.beans.factory.ObjectProvider<pl.shopivo.orders.ShippingCarriers> carriers;

    OrderMailer(Orders orders, Stores stores, PaymentSettings payments, EmailTemplates templates, EmailSender sender,
            ShopivoProperties properties, TransactionTemplate tx, org.springframework.beans.factory.ObjectProvider<pl.shopivo.orders.ShippingCarriers> carriers) {
        this.carriers = carriers;
        this.orders = orders;
        this.stores = stores;
        this.payments = payments;
        this.templates = templates;
        this.sender = sender;
        this.properties = properties;
        this.tx = tx;
    }

    record Data(OrderView order, StoreView store, String orderEmail, PaymentSettingsView payment) {
    }

    @Async
    @TransactionalEventListener
    void on(OrderEvents.OrderPlaced e) {
        Data d = load(e.tenantId(), e.orderId());
        List<String> lines = new ArrayList<>();
        lines.add("Dziękujemy za zamówienie w sklepie " + d.store().name() + ". Poniżej jego podsumowanie.");
        if (d.order().pickupPoint() != null) {
            lines.add("Dostawa do paczkomatu " + d.order().pickupPoint().code() + ": " + d.order().pickupPoint().address() + ".");
        }
        if (d.order().paymentMethod() == PaymentMethod.BANK_TRANSFER && d.payment().bankTransferEnabled()) {
            lines.add("Prosimy o przelew " + money(d.order().totalMinor()) + " na rachunek " + formatIban(d.payment().bankAccountNumber())
                    + " (odbiorca: " + d.payment().bankAccountHolder() + "), tytuł: „Zamówienie " + d.order().number() + "”. "
                    + "Nieopłacone zamówienie zostanie anulowane po " + d.payment().unpaidCancelDays() + " dniach.");
        } else if (d.order().paymentMethod() == PaymentMethod.ONLINE && d.order().paymentStatus() != PaymentStatus.PAID) {
            lines.add("Wybrałeś(-aś) płatność online. Jeśli płatność nie została dokończona, nieopłacone zamówienie zostanie anulowane"
                    + " po 24 godzinach. Jeśli masz konto w sklepie, zapłacisz też z poziomu „Moje konto”.");
        } else if (d.order().paymentMethod() == PaymentMethod.COD) {
            lines.add("Zapłacisz przy odbiorze przesyłki: " + money(d.order().totalMinor()) + ".");
        }
        send(d, d.order().email(), "Potwierdzenie zamówienia nr " + d.order().number(), "Przyjęliśmy Twoje zamówienie", lines, true);
        String owner = d.orderEmail() != null ? d.orderEmail() : d.store().contactEmail();
        if (owner != null) {
            send(d, owner, "Nowe zamówienie nr " + d.order().number() + " — " + money(d.order().totalMinor()), "Nowe zamówienie",
                    List.of(d.order().firstName() + " " + d.order().lastName() + " (" + d.order().email() + ") złożył(a) zamówienie.",
                            "Szczegóły: " + properties.appUrl() + "/sklep/" + e.tenantId() + "/zamowienia/" + e.orderId()), true);
        }
    }

    @Async
    @TransactionalEventListener
    void on(OrderEvents.OrderShipped e) {
        Data d = load(e.tenantId(), e.orderId());
        List<String> lines = new ArrayList<>();
        lines.add("Zamówienie nr " + d.order().number() + " zostało wysłane" + (d.order().shippingMethodName() == null ? "." : " (" + d.order().shippingMethodName() + ")."));
        if (d.order().trackingNumber() != null) lines.add("Numer przesyłki: " + d.order().trackingNumber());
        if (d.order().pickupPoint() != null) {
            lines.add("Odbiór w paczkomacie " + d.order().pickupPoint().code() + " (" + d.order().pickupPoint().address() + ").");
        }
        String trackingUrl = d.order().shippingCarrier() == null || d.order().trackingNumber() == null ? null
                : java.util.Optional.ofNullable(carriers.getIfAvailable())
                        .flatMap(c -> c.trackingUrl(d.order().shippingCarrier(), d.order().trackingNumber())).orElse(null);
        send(d, d.order().email(), "Zamówienie nr " + d.order().number() + " zostało wysłane", "Twoja paczka jest w drodze", lines, false,
                trackingUrl, "Śledź przesyłkę");
    }

    @Async
    @TransactionalEventListener
    void on(OrderEvents.OrderCanceled e) {
        if (!e.notifyCustomer()) return;
        Data d = load(e.tenantId(), e.orderId());
        List<String> lines = new ArrayList<>();
        lines.add("Zamówienie nr " + d.order().number() + " w sklepie " + d.store().name() + " zostało anulowane"
                + (d.order().cancelReason() == null ? "." : ": " + d.order().cancelReason() + "."));
        if (d.order().paymentStatus() == PaymentStatus.PAID) lines.add("Zwrot płatności zostanie zrealizowany przez sklep.");
        send(d, d.order().email(), "Zamówienie nr " + d.order().number() + " zostało anulowane", "Zamówienie anulowane", lines, false);
    }

    private Data load(java.util.UUID tenantId, java.util.UUID orderId) {
        return TenantContext.callInTenant(tenantId, () -> tx.execute(s ->
                new Data(orders.get(orderId), stores.current(), stores.currentSettings().orderEmail(), payments.current())));
    }

    private void send(Data d, String to, String subject, String heading, List<String> lines, boolean withItems) {
        send(d, to, subject, heading, lines, withItems, null, null);
    }

    private void send(Data d, String to, String subject, String heading, List<String> lines, boolean withItems, String actionUrl, String actionLabel) {
        Map<String, Object> vars = new HashMap<>();
        if (actionUrl != null) {
            vars.put("actionUrl", actionUrl);
            vars.put("actionLabel", actionLabel);
        }
        vars.put("subject", subject);
        vars.put("heading", heading);
        vars.put("lines", lines);
        vars.put("storeName", d.store().name());
        if (withItems) {
            vars.put("items", d.order().items().stream().map(i -> Map.of(
                    "name", i.name() + (i.variantTitle() == null ? "" : " — " + i.variantTitle()),
                    "quantity", i.quantity(), "total", money(i.lineTotalMinor()))).toList());
            List<Map<String, String>> totals = new ArrayList<>();
            totals.add(Map.of("label", "Produkty", "value", money(d.order().subtotalMinor())));
            if (d.order().shippingMethodName() != null) totals.add(Map.of("label", "Dostawa: " + d.order().shippingMethodName(), "value", money(d.order().shippingMinor())));
            if (d.order().paymentFeeMinor() > 0) totals.add(Map.of("label", "Opłata za pobranie", "value", money(d.order().paymentFeeMinor())));
            totals.add(Map.of("label", "Razem (w tym VAT " + money(d.order().taxMinor()) + ")", "value", money(d.order().totalMinor())));
            vars.put("totals", totals);
        }
        EmailMessage message = templates.render("order-notice", to, vars);
        sender.send(message);
    }

    static String money(long minor) {
        NumberFormat f = NumberFormat.getNumberInstance(Locale.forLanguageTag("pl-PL"));
        f.setMinimumFractionDigits(2);
        f.setMaximumFractionDigits(2);
        return f.format(minor / 100.0) + " zł";
    }

    static String formatIban(String iban) {
        if (iban == null) return "";
        String digits = iban.startsWith("PL") ? iban.substring(2) : iban;
        return digits.replaceAll("(.{2})(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})", "$1 $2 $3 $4 $5 $6 $7");
    }
}

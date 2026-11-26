package pl.shopivo.reviews.internal;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.email.EmailSender;
import pl.shopivo.email.EmailTemplates;
import pl.shopivo.orders.OrderEvents;
import pl.shopivo.orders.OrderModel.OrderView;
import pl.shopivo.orders.Orders;
import pl.shopivo.reviews.Reviews;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.Stores;

/** Review invitation after an order is completed, and a notice to the store about a review waiting for moderation. */
@Component
class ReviewMailer {

    private final Reviews reviews;
    private final Orders orders;
    private final Stores stores;
    private final EmailTemplates templates;
    private final EmailSender sender;
    private final ShopivoProperties properties;
    private final TransactionTemplate tx;
    private final String urlTemplate;

    ReviewMailer(Reviews reviews, Orders orders, Stores stores, EmailTemplates templates, EmailSender sender, ShopivoProperties properties,
            TransactionTemplate tx, @Value("${shopivo.storefront-url-template:https://{host}}") String urlTemplate) {
        this.reviews = reviews;
        this.orders = orders;
        this.stores = stores;
        this.templates = templates;
        this.sender = sender;
        this.properties = properties;
        this.tx = tx;
        this.urlTemplate = urlTemplate;
    }

    record Invite(String token, OrderView order, StoreView store) {
    }

    @Async
    @TransactionalEventListener
    void on(OrderEvents.OrderCompleted e) {
        Invite inv = TenantContext.callInTenant(e.tenantId(), () -> tx.execute(s -> {
            OrderView order = orders.get(e.orderId());
            if (order.source() != pl.shopivo.orders.OrderModel.Source.STOREFRONT || !Reviews.isVerifiedPurchase(order)
                    || order.items().stream().allMatch(i -> i.productId() == null)) {
                return null;
            }
            String token = reviews.invite(e.orderId());
            return token == null ? null : new Invite(token, order, stores.current());
        }));
        if (inv == null) return;
        String link = urlTemplate.replace("{host}", inv.store().primaryHostname()) + "/opinia#t=" + inv.token();
        send(inv.order().email(), "Jak oceniasz zakupy w sklepie " + inv.store().name() + "?", "Podziel się opinią",
                List.of("Dziękujemy za zamówienie nr " + inv.order().number() + ". Będzie nam miło, jeśli ocenisz kupione produkty —"
                        + " Twoja opinia pomoże innym klientom.", "Link jest ważny przez 90 dni."),
                inv.store().name(), link, "Oceń produkty");
    }

    @Async
    @TransactionalEventListener
    void on(Reviews.ReviewSubmitted e) {
        record Notice(StoreView store, String email, Reviews.ReviewView review) {
        }
        Notice n = TenantContext.callInTenant(e.tenantId(), () -> tx.execute(s -> new Notice(stores.current(),
                stores.currentSettings().orderEmail(), reviews.get(e.reviewId()))));
        String to = n.email() != null ? n.email() : n.store().contactEmail();
        if (to == null) return;
        send(to, "Nowa opinia do moderacji (" + n.review().rating() + "/5)", "Nowa opinia klienta",
                List.of(n.review().authorName() + " ocenił(a) produkt „" + n.review().productName() + "” na " + n.review().rating() + "/5.",
                        "Opinia pojawi się w sklepie po zatwierdzeniu."),
                n.store().name(), properties.appUrl() + "/sklep/" + e.tenantId() + "/opinie", "Przejdź do opinii");
    }

    private void send(String to, String subject, String heading, List<String> lines, String storeName, String actionUrl, String actionLabel) {
        Map<String, Object> vars = new HashMap<>();
        vars.put("subject", subject);
        vars.put("heading", heading);
        vars.put("lines", lines);
        vars.put("storeName", storeName);
        vars.put("actionUrl", actionUrl);
        vars.put("actionLabel", actionLabel);
        sender.send(templates.render("order-notice", to, vars));
    }

}

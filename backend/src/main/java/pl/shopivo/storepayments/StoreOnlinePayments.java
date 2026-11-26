package pl.shopivo.storepayments;

import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.orders.OnlinePayments;
import pl.shopivo.orders.OrderModel.OrderView;
import pl.shopivo.payments.GatewayException;
import pl.shopivo.payments.PaymentGatewayModels.PaymentLink;
import pl.shopivo.payments.PaymentGatewayModels.PaymentRequest;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.Stores;

/**
 * Starts payments with the store's operator. Every attempt is a row in {@code order_payments}; its id is the external id
 * the operator echoes back in notifications. The operator is called outside any database transaction.
 */
@Component
class StoreOnlinePayments implements OnlinePayments {

    private static final Logger log = LoggerFactory.getLogger(StoreOnlinePayments.class);

    private final StorePaymentProviders providers;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Stores stores;
    private final ShopivoProperties properties;
    private final String urlTemplate;

    StoreOnlinePayments(StorePaymentProviders providers, JdbcTemplate jdbc, TransactionTemplate tx, Stores stores,
            ShopivoProperties properties, @Value("${shopivo.storefront-url-template:https://{host}}") String urlTemplate) {
        this.providers = providers;
        this.jdbc = jdbc;
        this.tx = tx;
        this.stores = stores;
        this.properties = properties;
        this.urlTemplate = urlTemplate;
    }

    @Override
    public Optional<String> activeOperatorName() {
        return tx.execute(s -> providers.active()).filter(a -> a.enabled()).map(a -> a.gateway().descriptor().name());
    }

    @Override
    public String start(OrderView order, String customerIp) {
        UUID tenant = TenantContext.requireTenantId();
        var active = tx.execute(s -> providers.active()).filter(a -> a.enabled())
                .orElseThrow(() -> new BusinessRuleException("PAYMENT_METHOD_UNAVAILABLE", "Płatności online są chwilowo niedostępne."));
        String storeUrl = tx.execute(s -> urlTemplate.replace("{host}", stores.current().primaryHostname()));
        String storeName = tx.execute(s -> stores.current().name());
        UUID paymentId = UuidV7.generate();
        tx.executeWithoutResult(s -> jdbc.update("""
                insert into order_payments (id, tenant_id, order_id, provider_id, amount_minor, currency, sandbox) values (?, ?, ?, ?, ?, ?, ?)
                """, paymentId, tenant, order.id(), active.gateway().id(), order.totalMinor(), order.currency(), active.sandbox()));
        String returnUrl = storeUrl + "/zamowienie/potwierdzenie";
        PaymentLink link;
        try {
            link = active.gateway().createPayment(active.context(), new PaymentRequest(paymentId.toString(), order.totalMinor(), order.currency(),
                    truncate("Zamówienie nr " + order.number() + " — " + storeName, 120), order.email(),
                    (order.firstName() + " " + order.lastName()).strip(), customerIp, returnUrl,
                    properties.publicApiUrl() + "/api/v1/webhooks/store-payments/" + tenant + "/" + active.gateway().id()));
        } catch (GatewayException | IllegalStateException e) {
            log.warn("Starting payment of order {} with {} failed: {}", order.id(), active.gateway().id(), e.getMessage());
            tx.executeWithoutResult(s -> jdbc.update("update order_payments set status = 'FAILED' where id = ? and tenant_id = ?", paymentId, tenant));
            throw new BusinessRuleException("PAYMENT_START_FAILED", "Nie udało się połączyć z operatorem płatności. Spróbuj ponownie za chwilę.");
        }
        // Only send the customer to an operator page over HTTPS (or straight back to the store — the dev simulator does that).
        String url = link.redirectUrl();
        if (url == null || !(url.startsWith("https://") || url.equals(returnUrl))) {
            log.error("Operator {} returned an unexpected redirect URL for order {}", active.gateway().id(), order.id());
            throw new BusinessRuleException("PAYMENT_START_FAILED", "Nie udało się połączyć z operatorem płatności. Spróbuj ponownie za chwilę.");
        }
        tx.executeWithoutResult(s -> jdbc.update("update order_payments set provider_payment_id = ? where id = ? and tenant_id = ?",
                truncate(link.providerPaymentId(), 200), paymentId, tenant));
        return url;
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}

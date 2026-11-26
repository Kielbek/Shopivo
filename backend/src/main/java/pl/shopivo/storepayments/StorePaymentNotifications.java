package pl.shopivo.storepayments;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.orders.Orders;
import pl.shopivo.payments.PaymentGatewayModels.InboundNotification;
import pl.shopivo.payments.PaymentGatewayModels.NotificationAck;
import pl.shopivo.payments.PaymentGatewayModels.PaymentNotification;
import pl.shopivo.payments.PaymentGatewayModels.PaymentStatus;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Operator notifications for store payments. The store id in the URL only selects whose credentials verify the
 * signature — a notification is trusted solely because that store's operator secret signs it. Then: amount and
 * currency must match the attempt, each event is applied once, and a payment for a canceled order is flagged for refund.
 */
@Service
public class StorePaymentNotifications {

    private static final Logger log = LoggerFactory.getLogger(StorePaymentNotifications.class);

    private final StorePaymentProviders providers;
    private final Orders orders;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    StorePaymentNotifications(StorePaymentProviders providers, Orders orders, JdbcTemplate jdbc, TransactionTemplate tx) {
        this.providers = providers;
        this.orders = orders;
        this.jdbc = jdbc;
        this.tx = tx;
    }

    record Attempt(UUID id, UUID orderId, long amount, String currency, String status) {
    }

    public NotificationAck receive(UUID tenantId, String providerId, InboundNotification inbound) {
        return TenantContext.callInTenant(tenantId, () -> {
            var active = tx.execute(s -> providers.active()).filter(a -> a.gateway().id().equals(providerId))
                    .orElseThrow(NotFoundException::new);
            // Signature check (and, for some operators, confirmation call) — outside the database transaction.
            PaymentNotification n = active.gateway().handleNotification(active.context(), inbound);
            tx.executeWithoutResult(s -> apply(tenantId, providerId, active.gateway().descriptor().name(), n));
            return active.gateway().acknowledgement();
        });
    }

    private void apply(UUID tenant, String providerId, String operatorName, PaymentNotification n) {
        UUID paymentId = parse(n.externalId());
        Attempt attempt = paymentId == null ? null : jdbc.query("""
                select id, order_id, amount_minor, currency, status from order_payments where id = ? and tenant_id = ? and provider_id = ? for update
                """, (rs, i) -> new Attempt(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getLong(3), rs.getString(4), rs.getString(5)),
                paymentId, tenant, providerId).stream().findFirst().orElse(null);
        String outcome;
        if (attempt == null) {
            outcome = "UNKNOWN_PAYMENT";
            log.warn("Store payment notification for unknown payment {} (store {}, {})", n.externalId(), tenant, providerId);
        } else if (n.status() == PaymentStatus.PAID && (attempt.amount() != n.amountMinor() || !attempt.currency().equalsIgnoreCase(n.currency()))) {
            outcome = "AMOUNT_MISMATCH";
            log.error("Store payment {}: amount mismatch (expected {} {}, notified {} {}) — not marked paid", attempt.id(), attempt.amount(),
                    attempt.currency(), n.amountMinor(), n.currency());
        } else {
            outcome = n.status().name();
        }
        int recorded = jdbc.update("""
                insert into store_payment_events (id, tenant_id, provider_id, event_key, payment_id, outcome) values (?, ?, ?, ?, ?, ?)
                on conflict (tenant_id, provider_id, event_key) do nothing
                """, UuidV7.generate(), tenant, providerId, truncate(n.eventKey(), 300), attempt == null ? null : attempt.id(), outcome);
        if (recorded == 0 || attempt == null || "AMOUNT_MISMATCH".equals(outcome)) return; // duplicate or not applicable
        switch (n.status()) {
            case PAID -> {
                if (!"PAID".equals(attempt.status())) {
                    jdbc.update("update order_payments set status = 'PAID', paid_at = now(), provider_payment_id = coalesce(provider_payment_id, ?) where id = ?",
                            truncate(n.providerPaymentId(), 200), attempt.id());
                }
                var result = orders.markPaidOnline(attempt.orderId(), operatorName, n.providerPaymentId());
                if (result == Orders.OnlinePaymentOutcome.ORDER_CANCELED) {
                    log.warn("Payment {} received for canceled order {} — the store must refund it", attempt.id(), attempt.orderId());
                }
            }
            case FAILED -> {
                if ("PENDING".equals(attempt.status())) jdbc.update("update order_payments set status = 'FAILED' where id = ?", attempt.id());
            }
            case PENDING -> {
            }
        }
    }

    private static UUID parse(String id) {
        try {
            return id == null ? null : UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

}

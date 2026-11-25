package pl.shopivo.subscriptions.internal;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.billing.BillingEventHandler;
import pl.shopivo.payments.PaymentGatewayModels.PaymentNotification;
import pl.shopivo.shared.tenancy.TenantContext;

/** Applies verified operator notifications to subscription charges (idempotent — operators retry). */
@Component
class PaymentNotificationHandler implements BillingEventHandler {

    private static final Logger log = LoggerFactory.getLogger(PaymentNotificationHandler.class);

    private final ChargeRepository charges;
    private final SubscriptionEngine engine;
    private final TransactionTemplate tx;

    PaymentNotificationHandler(ChargeRepository charges, SubscriptionEngine engine, TransactionTemplate tx) {
        this.charges = charges;
        this.engine = engine;
        this.tx = tx;
    }

    @Override
    public void onPaymentNotification(String provider, PaymentNotification n) {
        UUID chargeId = chargeId(n.externalId());
        if (chargeId == null) {
            log.warn("Billing notification from {} with unknown external id format", provider);
            return;
        }
        // The charge's tenant is looked up in system context, then the change runs in that tenant's context.
        UUID tenantId = TenantContext.callAsSystem(() -> tx.execute(s -> charges.findById(chargeId).map(ChargeEntity::getTenantId).orElse(null)));
        if (tenantId == null) {
            log.warn("Billing notification from {} for unknown charge {}", provider, chargeId);
            return;
        }
        TenantContext.runInTenant(tenantId, () -> {
            switch (n.status()) {
                case PAID -> {
                    var outcome = engine.applyPayment(chargeId, n.providerPaymentId(), n.amountMinor(), n.currency());
                    log.info("Charge {} payment via {}: {}", chargeId, provider, outcome);
                }
                case FAILED -> engine.paymentFailed(chargeId);
                case PENDING -> log.debug("Charge {} payment pending at {}", chargeId, provider);
            }
        });
    }

    static UUID chargeId(String externalId) {
        if (externalId == null) return null;
        int sep = externalId.indexOf('_');
        try {
            return UUID.fromString(sep > 0 ? externalId.substring(0, sep) : externalId);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

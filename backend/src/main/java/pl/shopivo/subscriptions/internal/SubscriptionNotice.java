package pl.shopivo.subscriptions.internal;

import java.util.UUID;

/** Published inside the transaction that changed the subscription; e-mailed to the store owners after commit. */
public record SubscriptionNotice(UUID tenantId, Type type, UUID chargeId) {

    public enum Type {
        TRIAL_ENDING, TRIAL_EXPIRED, PAYMENT_DUE, PAYMENT_REMINDER, PAYMENT_RECEIVED, PAYMENT_FAILED, PAST_DUE,
        EXPIRED, CANCELED, FAIR_USE_EXCEEDED
    }
}

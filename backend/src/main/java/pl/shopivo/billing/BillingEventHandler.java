package pl.shopivo.billing;

import pl.shopivo.payments.PaymentGatewayModels.PaymentNotification;

/**
 * Receives verified payment notifications for platform billing. Implemented by the subscriptions module; called
 * without an active transaction (so it can bind the tenant). Must be idempotent — operators retry notifications.
 */
public interface BillingEventHandler {

    void onPaymentNotification(String provider, PaymentNotification notification);
}

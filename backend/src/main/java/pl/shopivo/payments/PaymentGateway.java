package pl.shopivo.payments;

import pl.shopivo.payments.PaymentGatewayModels.GatewayContext;
import pl.shopivo.payments.PaymentGatewayModels.GatewayDescriptor;
import pl.shopivo.payments.PaymentGatewayModels.InboundNotification;
import pl.shopivo.payments.PaymentGatewayModels.NotificationAck;
import pl.shopivo.payments.PaymentGatewayModels.PaymentLink;
import pl.shopivo.payments.PaymentGatewayModels.PaymentNotification;
import pl.shopivo.payments.PaymentGatewayModels.PaymentRequest;

/**
 * Adapter for one payment operator. Stateless: credentials come with every call ({@link GatewayContext}), so the
 * same adapter serves the platform account and every merchant account.
 */
public interface PaymentGateway {

    GatewayDescriptor descriptor();

    default String id() {
        return descriptor().id();
    }

    /** Registers a payment and returns the operator page the payer is redirected to. */
    PaymentLink createPayment(GatewayContext context, PaymentRequest request);

    /**
     * Verifies authenticity (signature) of a notification and — where the operator requires it — confirms the
     * transaction with the operator. Throws {@link InvalidNotificationException} for forged/invalid notifications.
     */
    PaymentNotification handleNotification(GatewayContext context, InboundNotification notification);

    NotificationAck acknowledgement();

    /** Checks credentials against the operator API. Throws {@link GatewayException} with a readable reason. */
    void testConnection(GatewayContext context);
}

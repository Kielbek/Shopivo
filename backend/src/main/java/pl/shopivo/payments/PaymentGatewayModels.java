package pl.shopivo.payments;

import java.util.List;
import java.util.Map;

/** Data types shared by all payment operator adapters. */
public final class PaymentGatewayModels {

    private PaymentGatewayModels() {
    }

    /** A credential the operator requires (rendered as a form field in the admin/merchant panel). */
    public record CredentialField(String key, String label, boolean secret, String hint) {
    }

    /**
     * Operator description for configuration screens. {@code connect} = the store connects through a hosted onboarding
     * (no keys typed in); {@code available} = the platform has everything the operator needs (e.g. its own Stripe key).
     */
    public record GatewayDescriptor(String id, String name, String description, List<CredentialField> credentials,
            String docsUrl, boolean connect, boolean available) {

        public GatewayDescriptor(String id, String name, String description, List<CredentialField> credentials, String docsUrl) {
            this(id, name, description, credentials, docsUrl, false, true);
        }
    }

    /** Credentials and environment of one configured account (platform or merchant). */
    public record GatewayContext(Map<String, String> credentials, boolean sandbox) {

        public String require(String key) {
            String value = credentials.get(key);
            if (value == null || value.isBlank()) {
                throw new GatewayException("Brak wymaganej konfiguracji operatora: " + key);
            }
            return value.trim();
        }
    }

    /**
     * @param externalId our identifier of the payment (echoed back in notifications)
     * @param amountMinor amount in grosze
     */
    public record PaymentRequest(
            String externalId,
            long amountMinor,
            String currency,
            String description,
            String customerEmail,
            String customerName,
            String customerIp,
            String returnUrl,
            String notifyUrl) {
    }

    public record PaymentLink(String redirectUrl, String providerPaymentId) {
    }

    /** Raw inbound notification as received by the webhook endpoint. */
    public record InboundNotification(String body, Map<String, String> headers, String contentType) {

        public String header(String name) {
            return headers.get(name.toLowerCase(java.util.Locale.ROOT));
        }
    }

    public enum PaymentStatus { PAID, FAILED, PENDING }

    /** A verified notification translated to a provider-neutral form. */
    public record PaymentNotification(
            String externalId,
            String providerPaymentId,
            PaymentStatus status,
            long amountMinor,
            String currency,
            /** Unique id of this notification for idempotency (provider payment id + status). */
            String eventKey) {
    }

    /** Body the operator expects in our HTTP 200 response to its notification. */
    public record NotificationAck(String body, String contentType) {
        public static final NotificationAck EMPTY = new NotificationAck("", "text/plain");
    }
}

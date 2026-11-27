package pl.shopivo.payments.internal;

import java.util.List;
import org.springframework.stereotype.Component;
import pl.shopivo.payments.GatewayException;
import pl.shopivo.payments.InvalidNotificationException;
import pl.shopivo.payments.PaymentGateway;
import pl.shopivo.payments.PaymentGatewayModels.GatewayContext;
import pl.shopivo.payments.PaymentGatewayModels.GatewayDescriptor;
import pl.shopivo.payments.PaymentGatewayModels.InboundNotification;
import pl.shopivo.payments.PaymentGatewayModels.NotificationAck;
import pl.shopivo.payments.PaymentGatewayModels.PaymentLink;
import pl.shopivo.payments.PaymentGatewayModels.PaymentNotification;
import pl.shopivo.payments.PaymentGatewayModels.PaymentRequest;
import pl.shopivo.payments.PaymentGatewayModels.PaymentStatus;
import pl.shopivo.payments.StripeConnect;
import tools.jackson.databind.JsonNode;

/**
 * Stripe through Shopivo's Connect platform. The store has no keys of its own: its context holds only the connected
 * account id ({@code accountId}); calls use the platform key. Notifications come from the platform's Connect webhook —
 * an event is accepted only for the account the store is connected to.
 */
@Component
class StripeConnectGateway implements PaymentGateway {

    static final String ID = "stripe";

    private final StripeConnect stripe;

    StripeConnectGateway(StripeConnect stripe) {
        this.stripe = stripe;
    }

    @Override
    public GatewayDescriptor descriptor() {
        return new GatewayDescriptor(ID, "Stripe", "Karty, BLIK, Przelewy24, Apple Pay i Google Pay. Konto zakładasz w kreatorze Stripe — bez kluczy API.",
                List.of(), "https://docs.stripe.com/connect", true, stripe.configured());
    }

    @Override
    public PaymentLink createPayment(GatewayContext ctx, PaymentRequest request) {
        StripeConnect.Checkout c = stripe.createCheckout(ctx.require("accountId"), request);
        return new PaymentLink(c.url(), c.id());
    }

    @Override
    public PaymentNotification handleNotification(GatewayContext ctx, InboundNotification n) {
        StripeConnect.ConnectEvent e = stripe.verifyEvent(n.body(), n.header("Stripe-Signature"));
        if (e.account() == null || !e.account().equals(ctx.require("accountId"))) {
            throw new InvalidNotificationException("Stripe event for another connected account");
        }
        JsonNode s = e.object();
        PaymentStatus status = switch (e.type()) {
            case "checkout.session.completed" -> "paid".equals(s.path("payment_status").asString()) ? PaymentStatus.PAID : PaymentStatus.PENDING;
            case "checkout.session.async_payment_succeeded" -> PaymentStatus.PAID;
            case "checkout.session.async_payment_failed", "checkout.session.expired" -> PaymentStatus.FAILED;
            default -> PaymentStatus.PENDING;
        };
        String externalId = s.path("client_reference_id").asString(null);
        if (externalId == null) externalId = s.path("metadata").path("shopivo_payment_id").asString(null);
        String providerId = s.path("payment_intent").isString() ? s.path("payment_intent").asString() : s.path("id").asString();
        return new PaymentNotification(externalId, providerId, status, s.path("amount_total").asLong(),
                s.path("currency").asString("").toUpperCase(java.util.Locale.ROOT), "stripe:" + e.id());
    }

    @Override
    public NotificationAck acknowledgement() {
        return NotificationAck.EMPTY;
    }

    @Override
    public void testConnection(GatewayContext ctx) {
        StripeConnect.AccountStatus a = stripe.account(ctx.require("accountId"));
        if (!a.chargesEnabled()) {
            throw new GatewayException(a.detailsSubmitted()
                    ? "Stripe weryfikuje jeszcze dane konta — płatności włączą się po weryfikacji."
                    : "Dokończ zakładanie konta w kreatorze Stripe.");
        }
    }
}

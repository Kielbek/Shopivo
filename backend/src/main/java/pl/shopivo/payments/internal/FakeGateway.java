package pl.shopivo.payments.internal;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import pl.shopivo.payments.InvalidNotificationException;
import pl.shopivo.payments.PaymentGateway;
import pl.shopivo.payments.PaymentGatewayModels.CredentialField;
import pl.shopivo.payments.PaymentGatewayModels.GatewayContext;
import pl.shopivo.payments.PaymentGatewayModels.GatewayDescriptor;
import pl.shopivo.payments.PaymentGatewayModels.InboundNotification;
import pl.shopivo.payments.PaymentGatewayModels.NotificationAck;
import pl.shopivo.payments.PaymentGatewayModels.PaymentLink;
import pl.shopivo.payments.PaymentGatewayModels.PaymentNotification;
import pl.shopivo.payments.PaymentGatewayModels.PaymentRequest;
import pl.shopivo.payments.PaymentGatewayModels.PaymentStatus;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * DEVELOPMENT AND TESTS ONLY (shopivo.payments.fake-gateway.enabled=true, never in production profiles).
 * Simulates an operator: returns the merchant straight to the return URL and — when auto-confirm is on — posts a
 * signed "paid" notification to the webhook a moment later, exercising the same pipeline as real operators.
 */
@Component
@ConditionalOnProperty(name = "shopivo.payments.fake-gateway.enabled", havingValue = "true")
class FakeGateway implements PaymentGateway {

    private static final Logger log = LoggerFactory.getLogger(FakeGateway.class);
    private static final GatewayDescriptor DESCRIPTOR = new GatewayDescriptor("fake", "Symulator płatności (dev)",
            "Tylko środowisko deweloperskie i testy — płatność jest od razu uznawana za opłaconą.",
            List.of(new CredentialField("secret", "Sekret podpisu", true, "Dowolny ciąg znaków")), null);

    private final JsonMapper json;
    private final boolean autoConfirm;

    FakeGateway(JsonMapper json, @Value("${shopivo.payments.fake-gateway.auto-confirm:false}") boolean autoConfirm,
            org.springframework.core.env.Environment environment) {
        if (environment.matchesProfiles("prod | production | staging")) {
            throw new IllegalStateException("The fake payment gateway must not be enabled in " + String.join(",", environment.getActiveProfiles()));
        }
        this.json = json;
        this.autoConfirm = autoConfirm;
    }

    @Override
    public GatewayDescriptor descriptor() {
        return DESCRIPTOR;
    }

    public static String sign(String body, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
            return java.util.HexFormat.of().formatHex(mac.doFinal(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public PaymentLink createPayment(GatewayContext ctx, PaymentRequest r) {
        String paymentId = "fake_" + UUID.randomUUID();
        if (autoConfirm) {
            String body = json.writeValueAsString(java.util.Map.of("externalId", r.externalId(), "paymentId", paymentId,
                    "status", "PAID", "amount", r.amountMinor(), "currency", r.currency()));
            String signature = sign(body, ctx.require("secret"));
            CompletableFuture.delayedExecutor(1500, TimeUnit.MILLISECONDS).execute(() -> {
                try {
                    HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(r.notifyUrl()))
                            .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
                            .header("X-Fake-Signature", signature).POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                            HttpResponse.BodyHandlers.discarding());
                } catch (Exception e) {
                    log.warn("Fake payment notification failed: {}", e.getMessage());
                }
            });
        }
        return new PaymentLink(r.returnUrl(), paymentId);
    }

    @Override
    public PaymentNotification handleNotification(GatewayContext ctx, InboundNotification n) {
        if (!Hashing.equalsConstantTime(sign(n.body(), ctx.require("secret")), n.header("X-Fake-Signature"))) {
            throw new InvalidNotificationException("Invalid fake signature");
        }
        JsonNode node = json.readTree(n.body());
        String paymentId = node.path("paymentId").asString();
        PaymentStatus status = PaymentStatus.valueOf(node.path("status").asString());
        return new PaymentNotification(node.path("externalId").asString(), paymentId, status,
                node.path("amount").asLong(), node.path("currency").asString(), "fake:" + paymentId + ":" + status);
    }

    @Override
    public NotificationAck acknowledgement() {
        return NotificationAck.EMPTY;
    }

    @Override
    public void testConnection(GatewayContext ctx) {
        ctx.require("secret");
    }
}

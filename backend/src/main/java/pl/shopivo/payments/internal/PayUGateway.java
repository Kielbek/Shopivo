package pl.shopivo.payments.internal;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import pl.shopivo.payments.GatewayException;
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
 * PayU REST API 2.1: OAuth client_credentials → POST /api/v2_1/orders → redirectUri. Notifications are signed with
 * the "second key" (OpenPayu-Signature header). Automatic receipt of payments must be enabled in the PayU POS.
 */
@Component
class PayUGateway implements PaymentGateway {

    static final String PRODUCTION = "https://secure.payu.com";
    static final String SANDBOX = "https://secure.snd.payu.com";

    private static final GatewayDescriptor DESCRIPTOR = new GatewayDescriptor("payu", "PayU",
            "BLIK, przelewy, karty, PayPo i raty. Konto: panel.payu.pl → Moje sklepy → Punkty płatności.",
            List.of(
                    new CredentialField("posId", "Id punktu płatności (pos_id)", false, null),
                    new CredentialField("clientId", "OAuth client_id", false, null),
                    new CredentialField("clientSecret", "OAuth client_secret", true, null),
                    new CredentialField("secondKey", "Drugi klucz (MD5)", true, "Służy do weryfikacji powiadomień")),
            "https://developers.payu.com/pl/restapi.html");

    private final RestClient.Builder http;
    private final JsonMapper json;
    private final Map<String, CachedToken> tokens = new ConcurrentHashMap<>();

    private record CachedToken(String value, Instant expiresAt) {
    }

    PayUGateway(@org.springframework.beans.factory.annotation.Qualifier(OperatorHttpConfiguration.BEAN) RestClient.Builder http, JsonMapper json) {
        this.http = http;
        this.json = json;
    }

    @Override
    public GatewayDescriptor descriptor() {
        return DESCRIPTOR;
    }

    private String base(GatewayContext ctx) {
        return ctx.sandbox() ? SANDBOX : PRODUCTION;
    }

    String accessToken(GatewayContext ctx) {
        String key = base(ctx) + "|" + ctx.require("clientId");
        CachedToken cached = tokens.get(key);
        if (cached != null && cached.expiresAt().isAfter(Instant.now().plusSeconds(30))) {
            return cached.value();
        }
        var form = new LinkedMultiValueMap<String, String>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", ctx.require("clientId"));
        form.add("client_secret", ctx.require("clientSecret"));
        try {
            JsonNode response = http.clone().baseUrl(base(ctx)).build().post().uri("/pl/standard/user/oauth/authorize")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class);
            String token = response == null ? null : response.path("access_token").asString(null);
            if (token == null) throw new GatewayException("PayU odrzuciło dane OAuth.");
            tokens.put(key, new CachedToken(token, Instant.now().plusSeconds(response.path("expires_in").asLong(300))));
            return token;
        } catch (RestClientException e) {
            throw new GatewayException("Brak połączenia z PayU lub nieprawidłowe dane OAuth.");
        }
    }

    @Override
    public PaymentLink createPayment(GatewayContext ctx, PaymentRequest r) {
        String amount = String.valueOf(r.amountMinor());
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("notifyUrl", r.notifyUrl());
        body.put("continueUrl", r.returnUrl());
        body.put("customerIp", r.customerIp() == null ? "127.0.0.1" : r.customerIp());
        body.put("merchantPosId", ctx.require("posId"));
        body.put("description", r.description());
        body.put("currencyCode", r.currency());
        body.put("totalAmount", amount);
        body.put("extOrderId", r.externalId());
        body.put("buyer", Map.of("email", r.customerEmail(), "language", "pl"));
        body.put("products", List.of(Map.of("name", r.description(), "unitPrice", amount, "quantity", "1")));
        try {
            // PayU answers 302 with a JSON body — read it regardless of the status code.
            JsonNode response = http.clone().baseUrl(base(ctx)).build().post().uri("/api/v2_1/orders")
                    .headers(h -> h.setBearerAuth(accessToken(ctx)))
                    .contentType(MediaType.APPLICATION_JSON).body(body)
                    .exchange((req, res) -> json.readTree(res.getBody()));
            if (!"SUCCESS".equals(response.path("status").path("statusCode").asString(""))) {
                throw new GatewayException("PayU odrzuciło zamówienie: " + response.path("status").path("statusDesc").asString("brak opisu"));
            }
            return new PaymentLink(response.path("redirectUri").asString(), response.path("orderId").asString());
        } catch (RestClientException e) {
            throw new GatewayException("Nie udało się utworzyć płatności w PayU.");
        }
    }

    /** "sender=checkout;signature=…;algorithm=MD5;content=DOCUMENT" */
    static Map<String, String> parseSignatureHeader(String header) {
        Map<String, String> result = new java.util.HashMap<>();
        if (header == null) return result;
        for (String part : header.split(";")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2) result.put(kv[0].trim().toLowerCase(Locale.ROOT), kv[1].trim());
        }
        return result;
    }

    static String expectedSignature(String body, String secondKey, String algorithm) {
        String algo = switch (algorithm == null ? "MD5" : algorithm.toUpperCase(Locale.ROOT)) {
            case "SHA256", "SHA-256" -> "SHA-256";
            case "SHA384", "SHA-384" -> "SHA-384";
            case "SHA512", "SHA-512" -> "SHA-512";
            default -> "MD5";
        };
        return Hashing.hex(algo, body + secondKey);
    }

    @Override
    public PaymentNotification handleNotification(GatewayContext ctx, InboundNotification n) {
        Map<String, String> sig = parseSignatureHeader(n.header("OpenPayu-Signature"));
        String expected = expectedSignature(n.body(), ctx.require("secondKey"), sig.get("algorithm"));
        if (!Hashing.equalsConstantTime(expected, sig.get("signature"))) {
            throw new InvalidNotificationException("Invalid PayU signature");
        }
        JsonNode order;
        try {
            order = json.readTree(n.body()).path("order");
        } catch (RuntimeException e) {
            throw new InvalidNotificationException("Malformed PayU notification");
        }
        String status = order.path("status").asString("");
        PaymentStatus mapped = switch (status) {
            case "COMPLETED" -> PaymentStatus.PAID;
            case "CANCELED" -> PaymentStatus.FAILED;
            default -> PaymentStatus.PENDING;
        };
        String orderId = order.path("orderId").asString("");
        return new PaymentNotification(order.path("extOrderId").asString(""), orderId, mapped,
                Long.parseLong(order.path("totalAmount").asString("0")), order.path("currencyCode").asString(""),
                "payu:" + orderId + ":" + status);
    }

    @Override
    public NotificationAck acknowledgement() {
        return NotificationAck.EMPTY;
    }

    @Override
    public void testConnection(GatewayContext ctx) {
        tokens.remove(base(ctx) + "|" + ctx.require("clientId"));
        accessToken(ctx);
    }
}

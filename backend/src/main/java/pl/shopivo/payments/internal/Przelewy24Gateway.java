package pl.shopivo.payments.internal;

import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
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
 * Przelewy24 REST API v1: transaction/register → redirect to /trnRequest/{token}; the status notification is signed
 * (SHA-384 with CRC) and the transaction MUST be confirmed with transaction/verify, otherwise P24 does not settle it.
 */
@Component
class Przelewy24Gateway implements PaymentGateway {

    static final String PRODUCTION = "https://secure.przelewy24.pl";
    static final String SANDBOX = "https://sandbox.przelewy24.pl";

    private static final GatewayDescriptor DESCRIPTOR = new GatewayDescriptor("przelewy24", "Przelewy24",
            "BLIK, przelewy online, karty i raty. Konto: panel.przelewy24.pl.",
            List.of(
                    new CredentialField("merchantId", "ID sprzedawcy", false, "Numer konta Przelewy24"),
                    new CredentialField("posId", "ID sklepu (POS)", false, "Zwykle taki sam jak ID sprzedawcy"),
                    new CredentialField("apiKey", "Klucz do raportów (API)", true, "Moje dane → Dane API i konfiguracja"),
                    new CredentialField("crc", "Klucz CRC", true, "Moje dane → Dane API i konfiguracja")),
            "https://developers.przelewy24.pl/");

    private final RestClient.Builder http;
    private final JsonMapper json;

    Przelewy24Gateway(@org.springframework.beans.factory.annotation.Qualifier(OperatorHttpConfiguration.BEAN) RestClient.Builder http, JsonMapper json) {
        this.http = http;
        this.json = json;
    }

    @Override
    public GatewayDescriptor descriptor() {
        return DESCRIPTOR;
    }

    private RestClient client(GatewayContext ctx) {
        String posId = posId(ctx);
        return http.clone().baseUrl(ctx.sandbox() ? SANDBOX : PRODUCTION)
                .defaultHeaders(h -> h.setBasicAuth(posId, ctx.require("apiKey"))).build();
    }

    private static String posId(GatewayContext ctx) {
        String pos = ctx.credentials().get("posId");
        return pos == null || pos.isBlank() ? ctx.require("merchantId") : pos.trim();
    }

    static String registerSign(String sessionId, long merchantId, long amount, String currency, String crc) {
        return Hashing.hex("SHA-384", "{\"sessionId\":" + Hashing.jsonString(sessionId) + ",\"merchantId\":" + merchantId
                + ",\"amount\":" + amount + ",\"currency\":" + Hashing.jsonString(currency) + ",\"crc\":" + Hashing.jsonString(crc) + "}");
    }

    static String notificationSign(long merchantId, long posId, String sessionId, long amount, long originAmount,
            String currency, long orderId, long methodId, String statement, String crc) {
        return Hashing.hex("SHA-384", "{\"merchantId\":" + merchantId + ",\"posId\":" + posId + ",\"sessionId\":"
                + Hashing.jsonString(sessionId) + ",\"amount\":" + amount + ",\"originAmount\":" + originAmount
                + ",\"currency\":" + Hashing.jsonString(currency) + ",\"orderId\":" + orderId + ",\"methodId\":" + methodId
                + ",\"statement\":" + Hashing.jsonString(statement) + ",\"crc\":" + Hashing.jsonString(crc) + "}");
    }

    static String verifySign(String sessionId, long orderId, long amount, String currency, String crc) {
        return Hashing.hex("SHA-384", "{\"sessionId\":" + Hashing.jsonString(sessionId) + ",\"orderId\":" + orderId
                + ",\"amount\":" + amount + ",\"currency\":" + Hashing.jsonString(currency) + ",\"crc\":" + Hashing.jsonString(crc) + "}");
    }

    @Override
    public PaymentLink createPayment(GatewayContext ctx, PaymentRequest r) {
        long merchantId = Long.parseLong(ctx.require("merchantId"));
        long posId = Long.parseLong(posId(ctx));
        String crc = ctx.require("crc");
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("merchantId", merchantId);
        body.put("posId", posId);
        body.put("sessionId", r.externalId());
        body.put("amount", r.amountMinor());
        body.put("currency", r.currency());
        body.put("description", truncate(r.description(), 1024));
        body.put("email", r.customerEmail());
        if (r.customerName() != null) body.put("client", truncate(r.customerName(), 40));
        body.put("country", "PL");
        body.put("language", "pl");
        body.put("urlReturn", r.returnUrl());
        body.put("urlStatus", r.notifyUrl());
        body.put("encoding", "UTF-8");
        body.put("sign", registerSign(r.externalId(), merchantId, r.amountMinor(), r.currency(), crc));
        try {
            JsonNode response = client(ctx).post().uri("/api/v1/transaction/register")
                    .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
            String token = response == null ? null : response.path("data").path("token").asString(null);
            if (token == null) throw new GatewayException("Przelewy24 nie zwróciło tokenu transakcji.");
            return new PaymentLink((ctx.sandbox() ? SANDBOX : PRODUCTION) + "/trnRequest/" + token, token);
        } catch (RestClientException e) {
            throw new GatewayException("Nie udało się zarejestrować płatności w Przelewy24. Sprawdź konfigurację operatora.");
        }
    }

    @Override
    public PaymentNotification handleNotification(GatewayContext ctx, InboundNotification n) {
        JsonNode node;
        try {
            node = json.readTree(n.body());
        } catch (RuntimeException e) {
            throw new InvalidNotificationException("Malformed Przelewy24 notification");
        }
        long merchantId = node.path("merchantId").asLong();
        long posId = node.path("posId").asLong();
        String sessionId = node.path("sessionId").asString("");
        long amount = node.path("amount").asLong();
        long originAmount = node.path("originAmount").asLong();
        String currency = node.path("currency").asString("");
        long orderId = node.path("orderId").asLong();
        long methodId = node.path("methodId").asLong();
        String statement = node.path("statement").asString("");
        String crc = ctx.require("crc");
        String expected = notificationSign(merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId,
                statement, crc);
        if (!Hashing.equalsConstantTime(expected, node.path("sign").asString(null))
                || merchantId != Long.parseLong(ctx.require("merchantId"))) {
            throw new InvalidNotificationException("Invalid Przelewy24 signature");
        }
        // Mandatory confirmation — without it the payment is not settled by Przelewy24.
        Map<String, Object> verify = new java.util.LinkedHashMap<>();
        verify.put("merchantId", merchantId);
        verify.put("posId", posId);
        verify.put("sessionId", sessionId);
        verify.put("amount", amount);
        verify.put("currency", currency);
        verify.put("orderId", orderId);
        verify.put("sign", verifySign(sessionId, orderId, amount, currency, crc));
        try {
            JsonNode response = client(ctx).put().uri("/api/v1/transaction/verify")
                    .contentType(MediaType.APPLICATION_JSON).body(verify).retrieve().body(JsonNode.class);
            if (response == null || !"success".equals(response.path("data").path("status").asString(""))) {
                throw new GatewayException("Przelewy24 nie potwierdziło transakcji.");
            }
        } catch (RestClientException e) {
            throw new GatewayException("Nie udało się potwierdzić transakcji w Przelewy24.");
        }
        return new PaymentNotification(sessionId, String.valueOf(orderId), PaymentStatus.PAID, amount, currency,
                "p24:" + orderId + ":PAID");
    }

    @Override
    public NotificationAck acknowledgement() {
        return NotificationAck.EMPTY;
    }

    @Override
    public void testConnection(GatewayContext ctx) {
        try {
            JsonNode response = client(ctx).get().uri("/api/v1/testAccess").retrieve().body(JsonNode.class);
            if (response == null || !response.path("data").asBoolean(false)) {
                throw new GatewayException("Przelewy24 odrzuciło dane dostępowe.");
            }
        } catch (RestClientException e) {
            throw new GatewayException("Brak połączenia z Przelewy24 lub nieprawidłowe dane dostępowe.");
        }
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}

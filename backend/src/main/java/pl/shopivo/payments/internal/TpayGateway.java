package pl.shopivo.payments.internal;

import java.math.BigDecimal;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
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

/**
 * Tpay Open API: OAuth → POST /transactions → transactionPaymentUrl. Notifications (form-encoded) are verified with
 * md5(id + tr_id + tr_amount + tr_crc + security code); Tpay expects the body "TRUE" in response.
 */
@Component
class TpayGateway implements PaymentGateway {

    static final String PRODUCTION = "https://api.tpay.com";
    static final String SANDBOX = "https://openapi.sandbox.tpay.com";

    private static final GatewayDescriptor DESCRIPTOR = new GatewayDescriptor("tpay", "Tpay",
            "BLIK, przelewy, karty, Google Pay i Apple Pay. Konto: panel.tpay.com.",
            List.of(
                    new CredentialField("merchantId", "ID sprzedawcy", false, null),
                    new CredentialField("clientId", "Client ID (Open API)", false, "Integracja → API → Klucze"),
                    new CredentialField("clientSecret", "Secret (Open API)", true, null),
                    new CredentialField("securityCode", "Kod bezpieczeństwa", true, "Ustawienia → Powiadomienia")),
            "https://docs.tpay.com/");

    private final RestClient.Builder http;
    private final Map<String, String[]> tokens = new ConcurrentHashMap<>();

    TpayGateway(@org.springframework.beans.factory.annotation.Qualifier(OperatorHttpConfiguration.BEAN) RestClient.Builder http) {
        this.http = http;
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
        String[] cached = tokens.get(key);
        if (cached != null && Instant.parse(cached[1]).isAfter(Instant.now().plusSeconds(30))) return cached[0];
        var form = new LinkedMultiValueMap<String, String>();
        form.add("client_id", ctx.require("clientId"));
        form.add("client_secret", ctx.require("clientSecret"));
        try {
            JsonNode response = http.clone().baseUrl(base(ctx)).build().post().uri("/oauth/auth")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class);
            String token = response == null ? null : response.path("access_token").asString(null);
            if (token == null) throw new GatewayException("Tpay odrzucił dane dostępowe.");
            tokens.put(key, new String[] {token, Instant.now().plusSeconds(response.path("expires_in").asLong(300)).toString()});
            return token;
        } catch (RestClientException e) {
            throw new GatewayException("Brak połączenia z Tpay lub nieprawidłowe dane dostępowe.");
        }
    }

    @Override
    public PaymentLink createPayment(GatewayContext ctx, PaymentRequest r) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("amount", BigDecimal.valueOf(r.amountMinor(), 2));
        body.put("description", r.description());
        body.put("hiddenDescription", r.externalId());
        body.put("lang", "pl");
        body.put("payer", r.customerName() == null ? Map.of("email", r.customerEmail())
                : Map.of("email", r.customerEmail(), "name", r.customerName()));
        body.put("callbacks", Map.of(
                "payerUrls", Map.of("success", r.returnUrl(), "error", r.returnUrl()),
                "notification", Map.of("url", r.notifyUrl())));
        try {
            JsonNode response = http.clone().baseUrl(base(ctx)).build().post().uri("/transactions")
                    .headers(h -> h.setBearerAuth(accessToken(ctx)))
                    .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
            if (response == null || !"success".equals(response.path("result").asString(""))) {
                throw new GatewayException("Tpay odrzucił transakcję.");
            }
            return new PaymentLink(response.path("transactionPaymentUrl").asString(), response.path("title").asString());
        } catch (RestClientException e) {
            throw new GatewayException("Nie udało się utworzyć płatności w Tpay.");
        }
    }

    static Map<String, String> parseForm(String body) {
        Map<String, String> result = new HashMap<>();
        for (String pair : body.split("&")) {
            if (pair.isEmpty()) continue;
            String[] kv = pair.split("=", 2);
            result.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8), kv.length > 1 ? URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "");
        }
        return result;
    }

    static String md5sum(String merchantId, String trId, String trAmount, String trCrc, String securityCode) {
        return Hashing.hex("MD5", merchantId + trId + trAmount + trCrc + securityCode);
    }

    @Override
    public PaymentNotification handleNotification(GatewayContext ctx, InboundNotification n) {
        Map<String, String> f = parseForm(n.body() == null ? "" : n.body());
        String expected = md5sum(f.getOrDefault("id", ""), f.getOrDefault("tr_id", ""), f.getOrDefault("tr_amount", ""),
                f.getOrDefault("tr_crc", ""), ctx.require("securityCode"));
        if (!Hashing.equalsConstantTime(expected, f.get("md5sum")) || !ctx.require("merchantId").equals(f.get("id"))) {
            throw new InvalidNotificationException("Invalid Tpay checksum");
        }
        String status = f.getOrDefault("tr_status", "");
        PaymentStatus mapped = switch (status) {
            case "TRUE", "PAID" -> PaymentStatus.PAID;
            case "FALSE", "CHARGEBACK" -> PaymentStatus.FAILED;
            default -> PaymentStatus.PENDING;
        };
        long amount;
        try {
            amount = new BigDecimal(f.getOrDefault("tr_amount", "0")).movePointRight(2).longValueExact();
        } catch (ArithmeticException | NumberFormatException e) {
            throw new InvalidNotificationException("Malformed Tpay amount");
        }
        return new PaymentNotification(f.getOrDefault("tr_crc", ""), f.get("tr_id"), mapped, amount, "PLN",
                "tpay:" + f.get("tr_id") + ":" + status);
    }

    @Override
    public NotificationAck acknowledgement() {
        return new NotificationAck("TRUE", "text/plain");
    }

    @Override
    public void testConnection(GatewayContext ctx) {
        tokens.remove(base(ctx) + "|" + ctx.require("clientId"));
        accessToken(ctx);
    }
}

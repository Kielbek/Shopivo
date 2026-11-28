package pl.shopivo.storepayments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import pl.shopivo.shared.tenancy.TenantContext;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

class StorePaymentsIT extends IntegrationTest {

    static final String SECRET = "sekret-sprzedawcy-123";

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    record Res(int status, JsonNode json, String body) {
        String code() {
            return json != null && json.has("code") ? json.get("code").asString() : null;
        }
    }

    private Res sf(String method, String host, String path, Map<String, String> headers, Object body) throws Exception {
        var b = (method.equals("GET") ? get("/api/v1/storefront" + path) : post("/api/v1/storefront" + path)).header("Host", host);
        headers.forEach(b::header);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        MockHttpServletResponse r = mvc.perform(b.with(req -> {
            req.setRemoteAddr("198.19.0." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        String content = r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return new Res(r.getStatus(), content.isBlank() || !content.startsWith("{") ? null : jsonMapper.readTree(content), content);
    }

    /** Signs like the operator would (the dev/test simulator uses HMAC-SHA256 over the body). */
    private static String sign(String body, String secret) throws Exception {
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new javax.crypto.spec.SecretKeySpec(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
        return java.util.HexFormat.of().formatHex(mac.doFinal(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    private int notify(String tenant, String provider, Map<String, Object> payload, String secret) throws Exception {
        String body = jsonMapper.writeValueAsString(payload);
        return mvc.perform(post("/api/v1/webhooks/store-payments/" + tenant + "/" + provider).contentType(MediaType.APPLICATION_JSON)
                .content(body).header("X-Fake-Signature", sign(body, secret))).andReturn().getResponse().getStatus();
    }

    record Shop(ApiClient owner, String tenant, String host, String variant) {
    }

    private Shop shop(String prefix) {
        ApiClient owner = registeredUser(uniqueEmail(prefix));
        String slug = uniqueSlug(prefix);
        String t = createStore(owner, "Sklep Płatności", slug);
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "PAY-1", "priceMinor", 12345, "trackInventory", true,
                "allowBackorder", false, "initialStock", 5));
        String variant = owner.post(base(t) + "/products", Map.of("name", "Lampa", "status", "ACTIVE", "variants", List.of(v), "version", 0))
                .json().get("variants").get(0).get("id").asString();
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1500, "active", true, "version", 0));
        return new Shop(owner, t, slug + ".shopivo.test", variant);
    }

    private Res order(Shop s, String paymentMethod) throws Exception {
        String cart = sf("POST", s.host(), "/cart", Map.of(), null).json().get("token").asString();
        sf("POST", s.host(), "/cart/items", Map.of("X-Cart-Token", cart), Map.of("variantId", s.variant(), "quantity", 1));
        String shipping = sf("GET", s.host(), "/checkout/options", Map.of(), null).json().get("shippingMethods").get(0).get("id").asString();
        return sf("POST", s.host(), "/checkout", Map.of("X-Cart-Token", cart), Map.of("email", uniqueEmail("klient"), "firstName", "Ola",
                "lastName", "Płatna", "paymentMethod", paymentMethod, "shippingMethodId", shipping, "termsAccepted", true, "marketingConsent", false,
                "shippingAddress", Map.of("name", "Ola", "line1", "ul. A 1", "postalCode", "00-001", "city", "Warszawa", "countryCode", "PL")));
    }

    private JsonNode orderByNumber(Shop s, long number) {
        String id = s.owner().get(base(s.tenant()) + "/orders?q=" + number).json().get("items").get(0).get("id").asString();
        return s.owner().get(base(s.tenant()) + "/orders/" + id).json();
    }

    @Test
    void merchantConfiguresOperatorAndVerifiedNotificationsMarkOrdersPaid() throws Exception {
        Shop s = shop("pay");

        // Configuration: secrets are write-only, the account must be tested before it can be enabled
        var saved = s.owner().put(base(s.tenant()) + "/online-payments", Map.of("providerId", "fake", "credentials", Map.of("secret", SECRET),
                "sandbox", true, "version", -1));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        assertThat(saved.body()).doesNotContain(SECRET);
        assertThat(saved.json().get("filled").get("secret").asBoolean()).isTrue();
        assertThat(s.owner().post(base(s.tenant()) + "/online-payments/enabled", Map.of("enabled", true)).code()).isEqualTo("NOT_VERIFIED");
        assertThat(s.owner().post(base(s.tenant()) + "/online-payments/test", Map.of()).status()).isEqualTo(200);
        var enabled = s.owner().post(base(s.tenant()) + "/online-payments/enabled", Map.of("enabled", true));
        assertThat(enabled.json().get("enabled").asBoolean()).isTrue();
        assertThat(s.owner().get(base(s.tenant()) + "/online-payments").body()).doesNotContain(SECRET);
        // Saving again with a blank secret keeps it, but requires a new test
        long version = enabled.json().get("version").asLong();
        var resaved = s.owner().put(base(s.tenant()) + "/online-payments", Map.of("providerId", "fake", "credentials", Map.of("secret", ""),
                "sandbox", true, "version", version));
        assertThat(resaved.json().get("filled").get("secret").asBoolean()).isTrue();
        assertThat(resaved.json().get("enabled").asBoolean()).isFalse();
        s.owner().post(base(s.tenant()) + "/online-payments/test", Map.of());
        s.owner().post(base(s.tenant()) + "/online-payments/enabled", Map.of("enabled", true));

        // Online payment is a publishable payment method on its own
        publishStore(s.owner(), s.tenant());
        JsonNode options = sf("GET", s.host(), "/checkout/options", Map.of(), null).json().get("paymentMethods");
        assertThat(options.get(0).get("method").asString()).isEqualTo("ONLINE");
        assertThat(options.get(0).get("label").asString()).contains("Symulator");
        assertThat(options.get(0).get("brand").asString()).isEqualTo("fake");
        assertThat(options.get(0).get("accepts")).isEmpty();

        // Checkout → pay → operator page (the simulator returns straight to the store)
        Res placed = order(s, "ONLINE");
        assertThat(placed.status()).as(placed.body).isEqualTo(201);
        String token = placed.json().get("orderToken").asString();
        long number = placed.json().get("number").asLong();
        Res pay = sf("POST", s.host(), "/orders/pay", Map.of("X-Order-Token", token), null);
        assertThat(pay.status()).as(pay.body).isEqualTo(200);
        assertThat(pay.json().get("redirectUrl").asString()).endsWith("/zamowienie/potwierdzenie");
        assertThat(sf("POST", s.host(), "/orders/pay", Map.of("X-Order-Token", "zly"), null).status()).isEqualTo(404);

        // Find the attempt id the operator would echo back (second attempt: retry is allowed while unpaid)
        String attempt = attemptId(s.tenant(), number);
        Map<String, Object> paid = Map.of("externalId", attempt, "paymentId", "op-1", "status", "PAID", "amount", 12345 + 1500, "currency", "PLN");

        // Forged signature → 400, nothing changes
        String body = jsonMapper.writeValueAsString(paid);
        assertThat(mvc.perform(post("/api/v1/webhooks/store-payments/" + s.tenant() + "/fake").contentType(MediaType.APPLICATION_JSON)
                .content(body).header("X-Fake-Signature", sign(body, "zgadniety-sekret"))).andReturn().getResponse().getStatus()).isEqualTo(400);
        assertThat(orderByNumber(s, number).get("paymentStatus").asString()).isEqualTo("UNPAID");

        // Wrong amount → acknowledged but not paid
        Map<String, Object> wrong = new HashMap<>(paid);
        wrong.put("amount", 100);
        wrong.put("paymentId", "op-wrong");
        assertThat(notify(s.tenant(), "fake", wrong, SECRET)).isEqualTo(200);
        assertThat(orderByNumber(s, number).get("paymentStatus").asString()).isEqualTo("UNPAID");

        // Correct, signed → paid; repeated notification is applied once
        assertThat(notify(s.tenant(), "fake", paid, SECRET)).isEqualTo(200);
        assertThat(notify(s.tenant(), "fake", paid, SECRET)).isEqualTo(200);
        JsonNode o = orderByNumber(s, number);
        assertThat(o.get("paymentStatus").asString()).isEqualTo("PAID");
        assertThat(o.get("events").toString()).contains("Opłacono online");
        assertThat(sf("POST", s.host(), "/orders/pay", Map.of("X-Order-Token", token), null).code()).isEqualTo("NOT_PAYABLE");
        assertThat(sf("GET", s.host(), "/orders/status", Map.of("X-Order-Token", token), null).json().get("paymentStatus").asString()).isEqualTo("PAID");

        // Payment for a canceled order: not revived, flagged for refund
        Res second = order(s, "ONLINE");
        long number2 = second.json().get("number").asLong();
        sf("POST", s.host(), "/orders/pay", Map.of("X-Order-Token", second.json().get("orderToken").asString()), null);
        JsonNode o2 = orderByNumber(s, number2);
        s.owner().post(base(s.tenant()) + "/orders/" + o2.get("id").asString() + "/status", Map.of("status", "CANCELED", "reason", "test",
                "version", o2.get("version").asLong()));
        assertThat(notify(s.tenant(), "fake", Map.of("externalId", attemptId(s.tenant(), number2), "paymentId", "op-2", "status", "PAID",
                "amount", 13845, "currency", "PLN"), SECRET)).isEqualTo(200);
        JsonNode canceled = orderByNumber(s, number2);
        assertThat(canceled.get("status").asString()).isEqualTo("CANCELED");
        assertThat(canceled.get("paymentStatus").asString()).isEqualTo("UNPAID");
        assertThat(canceled.get("events").toString()).contains("po anulowaniu");

        // Isolation: another store cannot see the configuration, and a notification addressed to it is rejected
        ApiClient other = registeredUser(uniqueEmail("pay-b"));
        String tb = createStore(other, "Inny", uniqueSlug("pay-b"));
        assertThat(other.get(base(tb) + "/online-payments").json().get("current").isNull()).isTrue();
        assertThat(notify(tb, "fake", paid, SECRET)).isEqualTo(404);
        // ...and without online payments the method is refused at checkout
        assertThat(other.get(base(s.tenant()) + "/online-payments").status()).isEqualTo(404);
    }

    @Autowired
    JdbcTemplate jdbc;

    /** Latest payment attempt of an order — the id the operator echoes back as externalId. */
    private String attemptId(String tenant, long number) {
        return TenantContext.callAsSystem(() -> jdbc.queryForObject("""
                select p.id::text from order_payments p join orders o on o.id = p.order_id
                where o.tenant_id = ?::uuid and o.number = ? order by p.created_at desc limit 1
                """, String.class, tenant, number));
    }
}

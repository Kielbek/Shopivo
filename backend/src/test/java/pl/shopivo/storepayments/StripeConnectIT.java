package pl.shopivo.storepayments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.payments.StripeConnect;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.FakeStripe;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

/**
 * Stripe Connect end to end against the local Stripe stand-in: connect (account + onboarding link), status, enabling,
 * checkout as a direct charge on the store's account, the platform webhook routed by connected account, signature checks.
 */
class StripeConnectIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    private JsonNode sf(String method, String host, String path, Map<String, String> headers, Object body) throws Exception {
        var b = (method.equals("GET") ? get("/api/v1/storefront" + path) : post("/api/v1/storefront" + path)).header("Host", host);
        headers.forEach(b::header);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        MockHttpServletResponse r = mvc.perform(b.with(req -> {
            req.setRemoteAddr("198.19.1." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        String c = r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return c.isBlank() ? null : jsonMapper.readTree(c);
    }

    private int webhook(String payload, String signature) throws Exception {
        return mvc.perform(post("/api/v1/webhooks/stripe-connect").contentType(MediaType.APPLICATION_JSON).content(payload)
                .header("Stripe-Signature", signature)).andReturn().getResponse().getStatus();
    }

    private String event(String id, String type, String account, Map<String, Object> object) {
        return jsonMapper.writeValueAsString(Map.of("id", id, "object", "event", "type", type, "account", account,
                "data", Map.of("object", object)));
    }

    private static String sign(String payload) {
        return StripeConnect.sign(FakeStripe.WEBHOOK_SECRET, java.time.Instant.now().getEpochSecond(), payload);
    }

    @Test
    void connectOnboardPayAndWebhook() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("stripe"));
        String slug = uniqueSlug("stripe");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Sklep Stripe", slug);
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "ST-1", "priceMinor", 10000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        String variant = owner.post(base(t) + "/products", Map.of("name", "Kubek", "status", "ACTIVE", "variants", List.of(v), "version", 0))
                .json().get("variants").get(0).get("id").asString();
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1500, "active", true, "version", 0));

        // Stripe is offered as a "connect" operator; keys cannot be typed in for it
        var overview = owner.get(base(t) + "/online-payments").json();
        assertThat(overview.toString()).contains("\"id\":\"stripe\"", "\"connect\":true", "\"available\":true");
        assertThat(owner.put(base(t) + "/online-payments", Map.of("providerId", "stripe", "credentials", Map.of(), "sandbox", true, "version", -1))
                .code()).isEqualTo("USE_CONNECT");

        // Connect: account created on the platform (PL, card/BLIK/P24 requested), single-use onboarding link
        var link = owner.post(base(t) + "/online-payments/stripe/connect", Map.of());
        assertThat(link.status()).as(link.body()).isEqualTo(200);
        assertThat(link.json().get("url").asString()).startsWith("https://connect.stripe.com/setup/c/acct_test");
        var accountCall = STRIPE.calls("/v1/accounts").getLast();
        assertThat(accountCall.form()).containsEntry("country", "PL").containsEntry("capabilities[blik_payments][requested]", "true")
                .containsEntry("capabilities[p24_payments][requested]", "true").containsEntry("controller[stripe_dashboard][type]", "full");
        assertThat(accountCall.version()).isEqualTo(StripeConnect.API_VERSION);
        String account = link.json().get("url").asString().split("/")[5];
        assertThat(STRIPE.calls("/v1/account_links").getLast().form().get("return_url")).endsWith("/sklep/" + t + "/platnosci?stripe=powrot");
        // Connecting again reuses the same account
        owner.post(base(t) + "/online-payments/stripe/connect", Map.of());
        assertThat(STRIPE.calls("/v1/accounts").stream().filter(c -> c.form().getOrDefault("metadata[shopivo_tenant_id]", "").equals(t)).count()).isEqualTo(1);

        // Not verified yet → cannot be enabled
        var status = owner.post(base(t) + "/online-payments/stripe/refresh", Map.of()).json();
        assertThat(status.get("connected").asBoolean()).isTrue();
        assertThat(status.get("chargesEnabled").asBoolean()).isFalse();
        assertThat(owner.post(base(t) + "/online-payments/enabled", Map.of("enabled", true)).code()).isEqualTo("NOT_VERIFIED");

        // Stripe finishes verification → account.updated (signed, routed by account) → verified → enable
        STRIPE.chargesEnabled.add(account);
        String updated = event("evt_acc_" + account, "account.updated", account, Map.of("id", account, "object", "account"));
        assertThat(webhook(updated, sign(updated))).isEqualTo(200);
        assertThat(owner.get(base(t) + "/online-payments/stripe").json().get("chargesEnabled").asBoolean()).isTrue();
        assertThat(owner.post(base(t) + "/online-payments/enabled", Map.of("enabled", true)).json().get("enabled").asBoolean()).isTrue();

        // Checkout: direct charge on the store's account, our payment id as client_reference_id
        publishStore(owner, t);
        String cart = sf("POST", host, "/cart", Map.of(), null).get("token").asString();
        sf("POST", host, "/cart/items", Map.of("X-Cart-Token", cart), Map.of("variantId", variant, "quantity", 1));
        String shipping = sf("GET", host, "/checkout/options", Map.of(), null).get("shippingMethods").get(0).get("id").asString();
        JsonNode placed = sf("POST", host, "/checkout", Map.of("X-Cart-Token", cart), Map.of("email", uniqueEmail("kl"), "firstName", "Ola",
                "lastName", "Stripe", "paymentMethod", "ONLINE", "shippingMethodId", shipping, "termsAccepted", true, "marketingConsent", false,
                "shippingAddress", Map.of("name", "Ola", "line1", "ul. A 1", "postalCode", "00-001", "city", "Warszawa", "countryCode", "PL")));
        JsonNode pay = sf("POST", host, "/orders/pay", Map.of("X-Order-Token", placed.get("orderToken").asString()), null);
        assertThat(pay.get("redirectUrl").asString()).startsWith("https://checkout.stripe.com/c/pay/cs_test_");
        var session = STRIPE.calls("/v1/checkout/sessions").getLast();
        assertThat(session.stripeAccount()).isEqualTo(account);
        assertThat(session.form()).containsEntry("line_items[0][price_data][currency]", "pln")
                .containsEntry("line_items[0][price_data][unit_amount]", "11500").containsEntry("mode", "payment");
        String paymentId = session.form().get("client_reference_id");
        Map<String, Object> completed = Map.of("id", "cs_x", "object", "checkout.session", "client_reference_id", paymentId,
                "payment_status", "paid", "amount_total", 11500, "currency", "pln", "payment_intent", "pi_123");

        // Forged signature → 400; event for another (unknown) account → ignored; wrong amount → not paid
        String evt = event("evt_paid_1", "checkout.session.completed", account, completed);
        assertThat(webhook(evt, "t=" + java.time.Instant.now().getEpochSecond() + ",v1=deadbeef")).isEqualTo(400);
        String stale = event("evt_old", "checkout.session.completed", account, completed);
        assertThat(webhook(stale, StripeConnect.sign(FakeStripe.WEBHOOK_SECRET, java.time.Instant.now().getEpochSecond() - 3600, stale))).isEqualTo(400);
        String foreign = event("evt_foreign", "checkout.session.completed", "acct_someone_else", completed);
        assertThat(webhook(foreign, sign(foreign))).isEqualTo(200);
        long number = placed.get("number").asLong();
        String orderId = owner.get(base(t) + "/orders?q=" + number).json().get("items").get(0).get("id").asString();
        assertThat(owner.get(base(t) + "/orders/" + orderId).json().get("paymentStatus").asString()).isEqualTo("UNPAID");
        Map<String, Object> cheap = new HashMap<>(completed);
        cheap.put("amount_total", 100);
        String wrong = event("evt_wrong", "checkout.session.completed", account, cheap);
        assertThat(webhook(wrong, sign(wrong))).isEqualTo(200);
        assertThat(owner.get(base(t) + "/orders/" + orderId).json().get("paymentStatus").asString()).isEqualTo("UNPAID");

        // Genuine event → paid (and a redelivery changes nothing)
        assertThat(webhook(evt, sign(evt))).isEqualTo(200);
        assertThat(webhook(evt, sign(evt))).isEqualTo(200);
        JsonNode order = owner.get(base(t) + "/orders/" + orderId).json();
        assertThat(order.get("paymentStatus").asString()).isEqualTo("PAID");

        // Another merchant cannot start or read this store's Stripe connection
        ApiClient other = registeredUser(uniqueEmail("stripe-obcy"));
        createStore(other, "Obcy", uniqueSlug("stripe-obcy"));
        assertThat(other.post(base(t) + "/online-payments/stripe/connect", Map.of()).status()).isEqualTo(404);
    }
}

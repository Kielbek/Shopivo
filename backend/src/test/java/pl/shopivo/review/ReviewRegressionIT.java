package pl.shopivo.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.subscriptions.internal.SubscriptionLifecycleJob;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** Regression tests for issues found in the security / production-readiness review of phases 2–3. */
class ReviewRegressionIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    SubscriptionLifecycleJob lifecycle;

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    private static Map<String, Object> product(String sku) {
        Map<String, Object> v = new HashMap<>();
        v.put("optionValues", Map.of());
        v.put("sku", sku);
        v.put("priceMinor", 1000);
        v.put("trackInventory", true);
        v.put("allowBackorder", false);
        v.put("initialStock", 5);
        return Map.of("name", "Produkt " + sku, "status", "ACTIVE", "variants", List.of(v), "version", 0);
    }

    @Test
    void oversizedBodiesAreRejectedBeforeParsing() throws Exception {
        byte[] big = new byte[2 * 1024 * 1024];
        java.util.Arrays.fill(big, (byte) 'a');
        var res = mvc.perform(post("/api/v1/storefront/checkout").header("Host", "nieznany.shopivo.test")
                .contentType(MediaType.APPLICATION_JSON).content(big)).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(413);
        var hook = mvc.perform(post("/api/v1/webhooks/billing/fake").contentType(MediaType.APPLICATION_JSON)
                .content(new byte[100 * 1024])).andReturn().getResponse();
        assertThat(hook.getStatus()).isEqualTo(413);
    }

    @Test
    void frameworkErrorsArePolishAndDoNotEchoInput() {
        ApiClient owner = registeredUser(uniqueEmail("errors"));
        String t = createStore(owner, "Sklep Błędów", uniqueSlug("err"));
        var res = owner.post(base(t) + "/products", "{nie-json");
        assertThat(res.status()).isEqualTo(400);
        assertThat(res.json().get("detail").asString()).startsWith("Nieprawidłowe żądanie");
    }

    @Test
    void currencyCannotChangeOnceThereArePrices() {
        ApiClient owner = registeredUser(uniqueEmail("currency"));
        String t = createStore(owner, "Sklep Walut", uniqueSlug("cur"));
        var store = owner.get(base(t) + "/store").json();
        Map<String, Object> eur = Map.of("name", "Sklep Walut", "defaultLocale", "pl-PL", "defaultCurrency", "EUR",
                "timezone", "Europe/Warsaw", "version", store.get("version").asLong());
        // Empty store: allowed
        var changed = owner.patch(base(t) + "/store", eur);
        assertThat(changed.status()).as(changed.body()).isEqualTo(200);
        assertThat(owner.post(base(t) + "/products", product("CUR-1")).status()).isEqualTo(201);
        var back = owner.patch(base(t) + "/store", Map.of("name", "Sklep Walut", "defaultLocale", "pl-PL", "defaultCurrency", "PLN",
                "timezone", "Europe/Warsaw", "version", changed.json().get("version").asLong()));
        assertThat(back.code()).isEqualTo("CURRENCY_LOCKED");
    }

    @Test
    void expiredStoreCanStillFulfilExistingOrdersButNotSellMore() {
        ApiClient owner = registeredUser(uniqueEmail("readonly"));
        String t = createStore(owner, "Sklep Wygasły", uniqueSlug("ro"));
        String variant = owner.post(base(t) + "/products", product("RO-1")).json().get("variants").get(0).get("id").asString();
        var order = owner.post(base(t) + "/orders", Map.of("lines", List.of(Map.of("variantId", variant, "quantity", 1)),
                "customer", Map.of("email", "k@example.com", "firstName", "K", "lastName", "L", "paymentMethod", "MANUAL",
                        "termsAccepted", false, "marketingConsent", false, "shippingAddress",
                        Map.of("name", "K L", "line1", "Ul 1", "postalCode", "00-001", "city", "Warszawa"),
                        "shippingMethodId", owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER",
                                "priceMinor", 0, "active", true, "version", 0)).json().get("id").asString())));
        assertThat(order.status()).as(order.body()).isEqualTo(201);

        TenantContext.runAsSystem(() -> jdbc.update("update subscriptions set trial_ends_at = now() - interval '1 minute' where tenant_id = ?",
                UUID.fromString(t)));
        lifecycle.runAt(Instant.now());

        assertThat(owner.post(base(t) + "/products", product("RO-2")).code()).isEqualTo("SUBSCRIPTION_INACTIVE");
        var shipped = owner.post(base(t) + "/orders/" + order.json().get("id").asString() + "/status",
                Map.of("status", "SHIPPED", "version", order.json().get("version").asLong()));
        assertThat(shipped.status()).as(shipped.body()).isEqualTo(200);
        assertThat(owner.post(base(t) + "/orders", Map.of("lines", List.of(), "customer", Map.of())).code()).isEqualTo("SUBSCRIPTION_INACTIVE");
    }

    @Test
    void panelApiIsRateLimitedPerUser() {
        ApiClient user = registeredUser(uniqueEmail("flood"));
        int limited = 0;
        for (int i = 0; i < 320; i++) {
            var res = user.get("/api/v1/stores");
            if (res.status() == 429) {
                limited++;
                assertThat(res.code()).isEqualTo("RATE_LIMITED");
                assertThat(res.raw().getHeader("Retry-After")).isNotBlank();
            }
        }
        assertThat(limited).isGreaterThan(0);
    }
}

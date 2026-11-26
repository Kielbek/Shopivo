package pl.shopivo.storefront;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import pl.shopivo.shared.captcha.FakeTurnstile;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

/** CAPTCHA on public forms (against a local stand-in for Cloudflare), header menu, customer-account badge in the panel. */
class StorefrontProtectionIT extends IntegrationTest {

    static final FakeTurnstile CLOUDFLARE;

    static {
        try {
            CLOUDFLARE = new FakeTurnstile();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void captcha(DynamicPropertyRegistry r) {
        r.add("shopivo.captcha.provider", () -> "turnstile");
        r.add("shopivo.captcha.site-key", () -> "0x-test-site-key");
        r.add("shopivo.captcha.secret-key", () -> "test-secret");
        r.add("shopivo.captcha.verify-url", CLOUDFLARE::url);
    }

    @AfterAll
    static void stop() {
        CLOUDFLARE.close();
    }

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    record Res(int status, JsonNode json) {
        String code() {
            return json != null && json.has("code") ? json.get("code").asString() : null;
        }
    }

    private Res sf(String method, String host, String path, Map<String, String> headers, Object body) throws Exception {
        var b = (method.equals("GET") ? get("/api/v1/storefront" + path) : post("/api/v1/storefront" + path)).header("Host", host);
        headers.forEach(b::header);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        MockHttpServletResponse r = mvc.perform(b.with(req -> {
            req.setRemoteAddr("198.18.0." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        String content = r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return new Res(r.getStatus(), content.isBlank() ? null : jsonMapper.readTree(content));
    }

    @Test
    void publicFormsRequireAPassedCaptchaAndMenuAndAccountsWork() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("bot"));
        String slug = uniqueSlug("bot");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Sklep Chroniony", slug);
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "B-1", "priceMinor", 2000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        String variant = owner.post(base(t) + "/products", Map.of("name", "Mydło", "status", "ACTIVE", "variants", List.of(v), "version", 0))
                .json().get("variants").get(0).get("id").asString();
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1000, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0, "unpaidCancelDays", 7, "version", -1));
        publishStore(owner, t);

        // The storefront learns the site key from the store configuration
        assertThat(sf("GET", host, "/store", Map.of(), null).json().get("captchaSiteKey").asString()).isEqualTo("0x-test-site-key");

        // Checkout: no token / failed token → refused, cart untouched; passed token → order
        String cart = sf("POST", host, "/cart", Map.of(), null).json().get("token").asString();
        sf("POST", host, "/cart/items", Map.of("X-Cart-Token", cart), Map.of("variantId", variant, "quantity", 1));
        String shipping = sf("GET", host, "/checkout/options", Map.of(), null).json().get("shippingMethods").get(0).get("id").asString();
        Map<String, Object> c = new HashMap<>(Map.of("email", uniqueEmail("kup"), "firstName", "Jan", "lastName", "Bot", "paymentMethod", "COD",
                "shippingMethodId", shipping, "termsAccepted", true, "marketingConsent", false,
                "shippingAddress", Map.of("name", "Jan", "line1", "ul. A 1", "postalCode", "00-001", "city", "Warszawa", "countryCode", "PL")));
        assertThat(sf("POST", host, "/checkout", Map.of("X-Cart-Token", cart), c).code()).isEqualTo("CAPTCHA_FAILED");
        assertThat(sf("POST", host, "/checkout", Map.of("X-Cart-Token", cart, "X-Captcha-Token", "bot"), c).code()).isEqualTo("CAPTCHA_FAILED");
        assertThat(sf("POST", host, "/checkout", Map.of("X-Cart-Token", cart, "X-Captcha-Token", "ok"), c).status()).isEqualTo(201);

        // Account registration and password reset
        String email = uniqueEmail("konto");
        Map<String, Object> reg = Map.of("email", email, "password", "Mocne-Haslo-Klienta-1", "firstName", "Jan", "lastName", "Nowak", "termsAccepted", true);
        assertThat(sf("POST", host, "/account/register", Map.of("X-Requested-With", "shopivo"), reg).code()).isEqualTo("CAPTCHA_FAILED");
        assertThat(sf("POST", host, "/account/register", Map.of("X-Requested-With", "shopivo", "X-Captcha-Token", "ok"), reg).status()).isEqualTo(202);
        assertThat(sf("POST", host, "/account/password-reset", Map.of("X-Requested-With", "shopivo"), Map.of("email", email)).code())
                .isEqualTo("CAPTCHA_FAILED");

        // Panel: customers with a confirmed account are marked
        String token = emails.awaitEmail(email, "Potwierdź konto").textBody().replaceAll("(?s).*potwierdz\\?t=([A-Za-z0-9_-]+).*", "$1");
        JsonNode customers = owner.get(base(t) + "/customers").json();
        assertThat(customers.get("items").get(0).get("accountCreatedAt").isNull()).isTrue();
        assertThat(sf("POST", host, "/account/verify", Map.of("X-Requested-With", "shopivo"), Map.of("token", token, "password", "Mocne-Haslo-Klienta-1"))
                .status()).isEqualTo(200);
        String customerWithOrder = c.get("email").toString();
        assertThat(customerWithOrder).isNotBlank();

        // Header menu: only store paths, validated, optimistic locking
        JsonNode menu = owner.get(base(t) + "/navigation").json();
        assertThat(menu.get("custom").asBoolean()).isFalse();
        assertThat(owner.put(base(t) + "/navigation", Map.of("items", List.of(Map.of("label", "Zło", "path", "https://evil.example")), "version", -1))
                .code()).isEqualTo("INVALID_PATH");
        assertThat(owner.put(base(t) + "/navigation", Map.of("items", List.of(Map.of("label", "Zło", "path", "//evil.example")), "version", -1))
                .code()).isEqualTo("INVALID_PATH");
        var saved = owner.put(base(t) + "/navigation", Map.of("items", List.of(Map.of("label", "Nowości", "path", "/produkty"),
                Map.of("label", "Regulamin", "path", "/strona/regulamin")), "version", -1));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        assertThat(owner.put(base(t) + "/navigation", Map.of("items", List.of(), "version", -1)).status()).isEqualTo(409);
        JsonNode publicMenu = sf("GET", host, "/store", Map.of(), null).json().get("menu");
        assertThat(publicMenu.size()).isEqualTo(2);
        assertThat(publicMenu.get(0).get("label").asString()).isEqualTo("Nowości");
    }

    @Test
    void customersWithConfirmedAccountsAreMarkedInThePanel() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("badge"));
        String slug = uniqueSlug("badge");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Sklep Konta", slug);
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "BD-1", "priceMinor", 2000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        String variant = owner.post(base(t) + "/products", Map.of("name", "Krem", "status", "ACTIVE", "variants", List.of(v), "version", 0))
                .json().get("variants").get(0).get("id").asString();
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1000, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0, "unpaidCancelDays", 7, "version", -1));
        publishStore(owner, t);
        String email = uniqueEmail("staly-klient");
        String cart = sf("POST", host, "/cart", Map.of(), null).json().get("token").asString();
        sf("POST", host, "/cart/items", Map.of("X-Cart-Token", cart), Map.of("variantId", variant, "quantity", 1));
        String shipping = sf("GET", host, "/checkout/options", Map.of(), null).json().get("shippingMethods").get(0).get("id").asString();
        sf("POST", host, "/checkout", Map.of("X-Cart-Token", cart, "X-Captcha-Token", "ok"), Map.of("email", email, "firstName", "Ewa", "lastName", "Stała",
                "paymentMethod", "COD", "shippingMethodId", shipping, "termsAccepted", true, "marketingConsent", false,
                "shippingAddress", Map.of("name", "Ewa", "line1", "ul. B 2", "postalCode", "00-002", "city", "Warszawa", "countryCode", "PL")));
        assertThat(owner.get(base(t) + "/customers").json().get("items").get(0).get("accountCreatedAt").isNull()).isTrue();

        sf("POST", host, "/account/register", Map.of("X-Requested-With", "shopivo", "X-Captcha-Token", "ok"),
                Map.of("email", email, "password", "Mocne-Haslo-Klienta-2", "firstName", "Ewa", "lastName", "Stała", "termsAccepted", true));
        // Not confirmed yet → not marked
        assertThat(owner.get(base(t) + "/customers").json().get("items").get(0).get("accountCreatedAt").isNull()).isTrue();
        String token = emails.awaitEmail(email, "Potwierdź konto").textBody().replaceAll("(?s).*potwierdz\\?t=([A-Za-z0-9_-]+).*", "$1");
        sf("POST", host, "/account/verify", Map.of("X-Requested-With", "shopivo"), Map.of("token", token, "password", "Mocne-Haslo-Klienta-2"));
        JsonNode customer = owner.get(base(t) + "/customers").json().get("items").get(0);
        assertThat(customer.get("accountCreatedAt").isNull()).isFalse();
        assertThat(owner.get(base(t) + "/customers/" + customer.get("id").asString()).json().get("accountCreatedAt").isNull()).isFalse();
    }
}

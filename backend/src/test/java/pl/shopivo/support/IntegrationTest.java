package pl.shopivo.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

/**
 * Base class for integration tests: real PostgreSQL (application connects as the non-privileged RLS role,
 * migrations run as the schema owner) and real Redis, both via Testcontainers.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(IntegrationTest.TestBeans.class)
public abstract class IntegrationTest {

    private static final AtomicInteger IP_COUNTER = new AtomicInteger(1);

    @Autowired
    protected MockMvc mvc;
    @Autowired
    protected JsonMapper jsonMapper;
    @Autowired
    protected CapturingEmailSender emails;
    @Autowired
    protected StringRedisTemplate redis;

    /** Shared local Stripe API stand-in (one per JVM, like the containers). */
    protected static final FakeStripe STRIPE;
    /** Shared local Apaczka / Furgonetka API stand-ins. */
    protected static final FakeCouriers COURIERS;

    static {
        try {
            STRIPE = new FakeStripe();
            COURIERS = new FakeCouriers();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void containers(DynamicPropertyRegistry registry) {
        registry.add("shopivo.stripe.api-base", STRIPE::url);
        registry.add("shopivo.stripe.secret-key", () -> FakeStripe.SECRET_KEY);
        registry.add("shopivo.stripe.connect-webhook-secret", () -> FakeStripe.WEBHOOK_SECRET);
        registry.add("shopivo.apaczka.api-url", () -> COURIERS.url() + "/apaczka/api/v2/");
        registry.add("shopivo.apaczka.sandbox-api-url", () -> COURIERS.url() + "/apaczka/api/v2/");
        registry.add("shopivo.furgonetka.api-url", () -> COURIERS.url() + "/furgonetka");
        registry.add("shopivo.furgonetka.sandbox-api-url", () -> COURIERS.url() + "/furgonetka");
        registry.add("shopivo.furgonetka.client-id", () -> FakeCouriers.FURGONETKA_CLIENT_ID);
        registry.add("shopivo.furgonetka.client-secret", () -> FakeCouriers.FURGONETKA_CLIENT_SECRET);
        var pg = TestContainers.POSTGRES;
        registry.add("spring.datasource.url", pg::getJdbcUrl);
        registry.add("spring.datasource.username", () -> "shopivo_app");
        registry.add("spring.datasource.password", () -> "shopivo_app_test");
        registry.add("spring.flyway.url", pg::getJdbcUrl);
        registry.add("spring.flyway.user", pg::getUsername);
        registry.add("spring.flyway.password", pg::getPassword);
        registry.add("spring.flyway.placeholders.appRole", () -> "shopivo_app");
        registry.add("spring.data.redis.url", () -> "redis://" + TestContainers.REDIS.getHost() + ":"
                + TestContainers.REDIS.getMappedPort(6379));
    }

    @TestConfiguration
    static class TestBeans {
        @Bean
        @Primary
        CapturingEmailSender capturingEmailSender() {
            return new CapturingEmailSender();
        }
    }

    @BeforeEach
    protected void resetRateLimits() {
        var keys = redis.keys("rl:*");
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
    }

    /** New anonymous client with a distinct IP (keeps per-IP rate limits independent between tests). */
    protected ApiClient client() {
        int n = IP_COUNTER.getAndIncrement();
        return new ApiClient(mvc, jsonMapper).fromIp("198.51." + (n / 250) + "." + (n % 250 + 1));
    }

    protected static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
    }

    protected static final String PASSWORD = "Bezpieczne-Haslo-2026";

    /** Registers, verifies and logs in a user. */
    protected ApiClient registeredUser(String email) {
        ApiClient client = client();
        var reg = client.post("/api/v1/auth/register", Map.of("email", email, "password", PASSWORD,
                "firstName", "Jan", "lastName", "Testowy", "acceptTerms", true));
        assertThat(reg.status()).as(reg.body()).isEqualTo(202);
        String token = emails.awaitToken(email, "Potwierdź adres e-mail");
        assertThat(client.post("/api/v1/auth/verify-email", Map.of("token", token)).status()).isEqualTo(204);
        var login = client.post("/api/v1/auth/login", Map.of("email", email, "password", PASSWORD, "rememberMe", false));
        assertThat(login.status()).as(login.body()).isEqualTo(200);
        return client;
    }

    protected ApiClient login(String email, String password) {
        ApiClient client = client();
        var login = client.post("/api/v1/auth/login", Map.of("email", email, "password", password, "rememberMe", false));
        assertThat(login.status()).as(login.body()).isEqualTo(200);
        return client;
    }

    /** Creates a store and returns its tenant id. */
    protected String createStore(ApiClient owner, String name, String slug) {
        var res = owner.post("/api/v1/stores", Map.of("name", name, "slug", slug));
        assertThat(res.status()).as(res.body()).isEqualTo(201);
        return res.json().get("tenantId").asString();
    }

    /** Fills the seller data required by law and publishes the store (needs an active product, shipping and payment). */
    protected void publishStore(ApiClient owner, String tenant) {
        var settings = owner.get("/api/v1/tenants/" + tenant + "/store/settings").json();
        var saved = owner.put("/api/v1/tenants/" + tenant + "/store/settings", Map.of("legalCompanyName", "Sklep Testowy Sp. z o.o.",
                "taxId", "5260001246", "addressLine1", "ul. Testowa 1", "postalCode", "00-001", "city", "Warszawa", "countryCode", "PL",
                "orderEmail", "zamowienia@example.com", "pricesIncludeTax", true, "version", settings.get("version").asLong()));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        publishLegalPages(owner, tenant);
        var published = owner.post("/api/v1/tenants/" + tenant + "/store/publish", Map.of());
        assertThat(published.status()).as(published.body()).isEqualTo(200);
    }

    /** Creates the terms and privacy policy from the templates and publishes them (placeholders replaced). */
    protected void publishLegalPages(ApiClient owner, String tenant) {
        for (String key : java.util.List.of("TERMS", "PRIVACY")) {
            var created = owner.post("/api/v1/tenants/" + tenant + "/content/legal/" + key, Map.of());
            if (created.status() == 409) continue;
            assertThat(created.status()).as(created.body()).isEqualTo(201);
            var page = created.json();
            String body = page.get("body").asString().replaceAll("\\[uzupełnij[^\\]]*\\]", "1 grudnia 2026 r.");
            var updated = owner.put("/api/v1/tenants/" + tenant + "/content/" + page.get("id").asString(), Map.of("kind", "PAGE",
                    "title", page.get("title").asString(), "body", body, "status", "PUBLISHED", "showInFooter", true,
                    "version", page.get("version").asLong()));
            assertThat(updated.status()).as(updated.body()).isEqualTo(200);
        }
    }

    protected static String uniqueSlug(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 6);
    }
}

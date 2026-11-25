package pl.shopivo.stores;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** A single application serves every store; the store is chosen by hostname only. */
class StorefrontRoutingIT extends IntegrationTest {

    private MockHttpServletResponse storefront(String host) throws Exception {
        return mvc.perform(get("/api/v1/storefront/store").header("Host", host)).andReturn().getResponse();
    }

    @Test
    void resolvesStoreByPlatformSubdomain() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("sf"));
        String slug = uniqueSlug("sf");
        createStore(owner, "Sklep z Kawą", slug);
        ApiClient other = registeredUser(uniqueEmail("sf2"));
        String otherSlug = uniqueSlug("sf2");
        createStore(other, "Inny Sklep", otherSlug);

        var res = storefront(slug + ".shopivo.test");
        assertThat(res.getStatus()).isEqualTo(200);
        var body = jsonMapper.readTree(res.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(body.get("name").asString()).isEqualTo("Sklep z Kawą");
        assertThat(body.get("status").asString()).isEqualTo("DRAFT");
        assertThat(body.has("tenantId")).isFalse();

        var otherBody = jsonMapper.readTree(storefront(otherSlug.toUpperCase() + ".shopivo.test:443").getContentAsString());
        assertThat(otherBody.get("name").asString()).isEqualTo("Inny Sklep");
    }

    @Test
    void unknownHostAndSuspendedStoreReturnNotFound() throws Exception {
        assertThat(storefront("nie-istnieje.shopivo.test").getStatus()).isEqualTo(404);
        assertThat(storefront("evil.example.com").getStatus()).isEqualTo(404);

        ApiClient owner = registeredUser(uniqueEmail("sf3"));
        String slug = uniqueSlug("sf3");
        String tenant = createStore(owner, "Zawieszany", slug);
        ApiClient admin = login("admin@shopivo.test", "Platforma!Testowa-2026");
        admin.post("/api/v1/admin/tenants/" + tenant + "/suspend", Map.of("reason", "test"));
        assertThat(storefront(slug + ".shopivo.test").getStatus()).isEqualTo(404);
    }
}

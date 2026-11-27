package pl.shopivo.stores;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** The store industry: chosen at creation, changed in settings, validated, writable only by those who manage settings. */
class StoreIndustryIT extends IntegrationTest {

    @Test
    void industryIsSetAtCreationAndChangeable() {
        ApiClient owner = registeredUser(uniqueEmail("branza"));
        var created = owner.post("/api/v1/stores", Map.of("name", "Moda Ola", "slug", uniqueSlug("moda"), "industry", "FASHION"));
        assertThat(created.status()).isEqualTo(201);
        String t = created.json().get("tenantId").asString();
        assertThat(owner.get("/api/v1/tenants/" + t + "/store").json().get("industry").asString()).isEqualTo("FASHION");

        assertThat(owner.put("/api/v1/tenants/" + t + "/store/industry", Map.of("industry", "FOOTWEAR")).json().get("industry").asString())
                .isEqualTo("FOOTWEAR");
        assertThat(owner.put("/api/v1/tenants/" + t + "/store/industry", Map.of("industry", "WEAPONS")).status()).isEqualTo(400);
        Map<String, Object> clear = new HashMap<>();
        clear.put("industry", null);
        assertThat(owner.put("/api/v1/tenants/" + t + "/store/industry", clear).json().get("industry").isNull()).isTrue();

        // Without an industry the store is still created
        String other = createStore(owner, "Bez branży", uniqueSlug("bez"));
        assertThat(owner.get("/api/v1/tenants/" + other + "/store").json().get("industry").isNull()).isTrue();

        // Another merchant cannot change it
        ApiClient stranger = registeredUser(uniqueEmail("obcy"));
        assertThat(stranger.put("/api/v1/tenants/" + t + "/store/industry", Map.of("industry", "BOOKS")).status()).isEqualTo(404);
    }

    @Test
    void storeCanHaveSeveralIndustriesPrimaryFirst() {
        ApiClient owner = registeredUser(uniqueEmail("branze"));
        var created = owner.post("/api/v1/stores", Map.of("name", "Moda i zapach", "slug", uniqueSlug("multi"),
                "industries", java.util.List.of("FASHION", "FOOTWEAR", "PERFUMES", "FASHION")));
        assertThat(created.status()).isEqualTo(201);
        String t = created.json().get("tenantId").asString();
        var store = owner.get("/api/v1/tenants/" + t + "/store").json();
        assertThat(store.get("industry").asString()).isEqualTo("FASHION");
        assertThat(store.get("industries").toString()).isEqualTo("[\"FASHION\",\"FOOTWEAR\",\"PERFUMES\"]");

        // Reorder: the new first one becomes primary; "Wielobranżowy" next to others is dropped
        var changed = owner.put("/api/v1/tenants/" + t + "/store/industry", Map.of("industries", java.util.List.of("PERFUMES", "GENERAL", "COSMETICS"))).json();
        assertThat(changed.get("industry").asString()).isEqualTo("PERFUMES");
        assertThat(changed.get("industries").toString()).isEqualTo("[\"PERFUMES\",\"COSMETICS\"]");

        // At most 5
        assertThat(owner.put("/api/v1/tenants/" + t + "/store/industry",
                Map.of("industries", java.util.List.of("FASHION", "FOOTWEAR", "PERFUMES", "COSMETICS", "JEWELRY", "GIFTS"))).code())
                .isEqualTo("TOO_MANY_INDUSTRIES");
        // Empty list clears everything
        var cleared = owner.put("/api/v1/tenants/" + t + "/store/industry", Map.of("industries", java.util.List.of())).json();
        assertThat(cleared.get("industry").isNull()).isTrue();
        assertThat(cleared.get("industries").size()).isZero();
        // The legacy single field still works and resets the extra ones
        var single = owner.put("/api/v1/tenants/" + t + "/store/industry", Map.of("industry", "BOOKS")).json();
        assertThat(single.get("industries").toString()).isEqualTo("[\"BOOKS\"]");
    }
}

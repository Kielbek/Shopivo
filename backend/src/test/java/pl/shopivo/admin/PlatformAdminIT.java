package pl.shopivo.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

class PlatformAdminIT extends IntegrationTest {

    private ApiClient admin() {
        return login("admin@shopivo.test", "Platforma!Testowa-2026");
    }

    @Test
    void merchantsCannotUseAdminApi() {
        ApiClient merchant = registeredUser(uniqueEmail("merchant"));
        assertThat(merchant.get("/api/v1/admin/overview").status()).isEqualTo(403);
        assertThat(merchant.get("/api/v1/admin/tenants").status()).isEqualTo(403);
        assertThat(client().get("/api/v1/admin/overview").status()).isEqualTo(401);
    }

    @Test
    void adminSeesPlatformAndCanSuspendStoresAndUsers() {
        String ownerEmail = uniqueEmail("susp");
        ApiClient owner = registeredUser(ownerEmail);
        String slug = uniqueSlug("zawieszony");
        String tenant = createStore(owner, "Do zawieszenia", slug);
        ApiClient admin = admin();

        var overview = admin.get("/api/v1/admin/overview");
        assertThat(overview.status()).isEqualTo(200);
        assertThat(overview.json().get("stores").asLong()).isPositive();
        assertThat(overview.json().get("users").asLong()).isPositive();

        // Listing without filters (regression: untyped NULL parameter) and with each filter
        assertThat(admin.get("/api/v1/admin/tenants").status()).isEqualTo(200);
        assertThat(admin.get("/api/v1/admin/tenants?status=ACTIVE").json().get("items").toString()).contains(slug);
        assertThat(admin.get("/api/v1/admin/tenants?status=SUSPENDED&q=zawieszenia").json().get("items").size()).isZero();
        assertThat(admin.get("/api/v1/admin/users").status()).isEqualTo(200);
        assertThat(admin.get("/api/v1/admin/users?q=" + ownerEmail.substring(0, 8)).json().get("items").toString()).contains(ownerEmail);
        var list = admin.get("/api/v1/admin/tenants?q=" + "zawieszenia");
        assertThat(list.json().get("items").toString()).contains(slug, ownerEmail);

        var suspended = admin.post("/api/v1/admin/tenants/" + tenant + "/suspend", Map.of("reason", "Naruszenie regulaminu"));
        assertThat(suspended.status()).as(suspended.body()).isEqualTo(200);
        assertThat(owner.get("/api/v1/tenants/" + tenant + "/store").status()).isEqualTo(404);
        assertThat(owner.get("/api/v1/stores").json().get(0).get("tenantStatus").asString()).isEqualTo("SUSPENDED");
        assertThat(admin.post("/api/v1/admin/tenants/" + tenant + "/reactivate", null).status()).isEqualTo(200);
        assertThat(owner.get("/api/v1/tenants/" + tenant + "/store").status()).isEqualTo(200);

        String userId = owner.get("/api/v1/auth/me").json().get("id").asString();
        assertThat(admin.post("/api/v1/admin/users/" + userId + "/suspend", null).status()).isEqualTo(200);
        assertThat(owner.get("/api/v1/auth/me").status()).isEqualTo(401);
        var blockedLogin = client().post("/api/v1/auth/login", Map.of("email", ownerEmail, "password", PASSWORD, "rememberMe", false));
        assertThat(blockedLogin.code()).isEqualTo("ACCOUNT_SUSPENDED");
        assertThat(admin.post("/api/v1/admin/users/" + userId + "/reactivate", null).status()).isEqualTo(200);
        login(ownerEmail, PASSWORD);

        var audit = admin.get("/api/v1/admin/audit-logs?tenantId=" + tenant);
        assertThat(audit.json().get("items").toString()).contains("admin.tenant.suspended", "admin.tenant.reactivated");
    }
}

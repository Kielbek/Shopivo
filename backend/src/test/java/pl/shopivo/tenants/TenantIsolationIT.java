package pl.shopivo.tenants;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** Cross-tenant access through the API must be impossible, whatever identifiers the client sends. */
class TenantIsolationIT extends IntegrationTest {

    @Test
    void merchantCannotAccessAnotherStore() {
        ApiClient alice = registeredUser(uniqueEmail("alice"));
        ApiClient bob = registeredUser(uniqueEmail("bob"));
        String aliceTenant = createStore(alice, "Sklep Alicji", uniqueSlug("alicja"));
        String bobTenant = createStore(bob, "Sklep Boba", uniqueSlug("bob"));

        assertThat(alice.get("/api/v1/tenants/" + aliceTenant + "/store").status()).isEqualTo(200);

        for (String path : new String[] {"/store", "/store/settings", "/members", "/invitations", "/audit-logs"}) {
            var res = alice.get("/api/v1/tenants/" + bobTenant + path);
            assertThat(res.status()).as(path).isEqualTo(404);
            assertThat(res.code()).isEqualTo("NOT_FOUND");
        }
        var patch = alice.patch("/api/v1/tenants/" + bobTenant + "/store", Map.of("name", "Przejęty", "defaultLocale", "pl-PL",
                "defaultCurrency", "PLN", "timezone", "Europe/Warsaw", "version", 0));
        assertThat(patch.status()).isEqualTo(404);
        assertThat(alice.post("/api/v1/tenants/" + bobTenant + "/invitations",
                Map.of("email", uniqueEmail("x"), "role", "ADMIN")).status()).isEqualTo(404);
        assertThat(bob.get("/api/v1/tenants/" + bobTenant + "/store").json().get("name").asString()).isEqualTo("Sklep Boba");

        // Lists only contain own stores
        var aliceStores = alice.get("/api/v1/stores").json();
        assertThat(aliceStores.size()).isEqualTo(1);
        assertThat(aliceStores.get(0).get("tenantId").asString()).isEqualTo(aliceTenant);
        assertThat(aliceStores.get(0).get("role").asString()).isEqualTo("OWNER");
        assertThat(aliceStores.get(0).get("primaryHostname").asString()).endsWith(".shopivo.test");
    }

    @Test
    void foreignResourceIdsCannotBeUsedThroughOwnTenantPath() {
        ApiClient alice = registeredUser(uniqueEmail("idor-a"));
        ApiClient bob = registeredUser(uniqueEmail("idor-b"));
        String aliceTenant = createStore(alice, "IDOR A", uniqueSlug("ia"));
        String bobTenant = createStore(bob, "IDOR B", uniqueSlug("ib"));
        String invitationId = bob.post("/api/v1/tenants/" + bobTenant + "/invitations",
                Map.of("email", uniqueEmail("guest"), "role", "MANAGER")).json().get("id").asString();
        String bobMembership = bob.get("/api/v1/tenants/" + bobTenant + "/members").json().get(0).get("membershipId").asString();

        // Alice addresses Bob's objects through her own (authorised) tenant path.
        assertThat(alice.delete("/api/v1/tenants/" + aliceTenant + "/invitations/" + invitationId).status()).isEqualTo(404);
        assertThat(alice.post("/api/v1/tenants/" + aliceTenant + "/invitations/" + invitationId + "/resend", null).status()).isEqualTo(404);
        assertThat(alice.patch("/api/v1/tenants/" + aliceTenant + "/members/" + bobMembership, Map.of("role", "ADMIN")).status()).isEqualTo(404);
        assertThat(alice.delete("/api/v1/tenants/" + aliceTenant + "/members/" + bobMembership).status()).isEqualTo(404);

        assertThat(bob.get("/api/v1/tenants/" + bobTenant + "/invitations").json().size()).isEqualTo(1);
        assertThat(bob.get("/api/v1/tenants/" + bobTenant + "/members").json().get(0).get("role").asString()).isEqualTo("OWNER");
    }

    @Test
    void malformedAndUnknownTenantIdsReturnNotFound() {
        ApiClient alice = registeredUser(uniqueEmail("alice2"));
        assertThat(alice.get("/api/v1/tenants/not-a-uuid/store").status()).isEqualTo(404);
        assertThat(alice.get("/api/v1/tenants/00000000-0000-0000-0000-000000000000/store").status()).isEqualTo(404);
        assertThat(client().get("/api/v1/tenants/00000000-0000-0000-0000-000000000000/store").status()).isEqualTo(401);
    }

    @Test
    void tenantIdInRequestBodyIsIgnored() {
        ApiClient alice = registeredUser(uniqueEmail("alice3"));
        ApiClient bob = registeredUser(uniqueEmail("bob3"));
        String aliceTenant = createStore(alice, "Sklep A", uniqueSlug("sa"));
        String bobTenant = createStore(bob, "Sklep B", uniqueSlug("sb"));
        var store = alice.get("/api/v1/tenants/" + aliceTenant + "/store").json();

        var res = alice.patch("/api/v1/tenants/" + aliceTenant + "/store", Map.of("name", "Nowa nazwa", "tenantId", bobTenant,
                "defaultLocale", "pl-PL", "defaultCurrency", "PLN", "timezone", "Europe/Warsaw",
                "version", store.get("version").asLong()));
        assertThat(res.status()).as(res.body()).isEqualTo(200);
        assertThat(res.json().get("tenantId").asString()).isEqualTo(aliceTenant);
        assertThat(bob.get("/api/v1/tenants/" + bobTenant + "/store").json().get("name").asString()).isEqualTo("Sklep B");
    }

    @Test
    void slugsAreGloballyUniqueAndValidated() {
        ApiClient alice = registeredUser(uniqueEmail("slug"));
        String slug = uniqueSlug("unikat");
        createStore(alice, "Pierwszy", slug);
        var dup = alice.post("/api/v1/stores", Map.of("name", "Drugi", "slug", slug));
        assertThat(dup.status()).isEqualTo(409);
        assertThat(dup.code()).isEqualTo("SLUG_TAKEN");
        assertThat(alice.get("/api/v1/stores/slug-availability?slug=" + slug).json().get("reason").asString()).isEqualTo("TAKEN");
        assertThat(alice.get("/api/v1/stores/slug-availability?slug=admin").json().get("reason").asString()).isEqualTo("RESERVED");
        assertThat(alice.post("/api/v1/stores", Map.of("name", "Zły", "slug", "Zły Adres")).code()).isEqualTo("INVALID_SLUG");
    }

    @Test
    void optimisticLockingRejectsStaleUpdates() {
        ApiClient alice = registeredUser(uniqueEmail("lock"));
        String tenant = createStore(alice, "Sklep", uniqueSlug("ol"));
        Map<String, Object> body = Map.of("name", "Zmiana 1", "defaultLocale", "pl-PL", "defaultCurrency", "PLN",
                "timezone", "Europe/Warsaw", "version", 0);
        assertThat(alice.patch("/api/v1/tenants/" + tenant + "/store", body).status()).isEqualTo(200);
        var stale = alice.patch("/api/v1/tenants/" + tenant + "/store", body);
        assertThat(stale.status()).isEqualTo(409);
        assertThat(stale.code()).isEqualTo("CONCURRENT_MODIFICATION");
    }

    @Test
    void settingsValidatePolishBusinessData() {
        ApiClient alice = registeredUser(uniqueEmail("nip"));
        String tenant = createStore(alice, "Firma", uniqueSlug("firma"));
        var settings = alice.get("/api/v1/tenants/" + tenant + "/store/settings").json();
        Map<String, Object> base = new java.util.HashMap<>(Map.of("countryCode", "PL", "pricesIncludeTax", true,
                "version", settings.get("version").asLong()));
        base.put("taxId", "1234567890");
        assertThat(alice.put("/api/v1/tenants/" + tenant + "/store/settings", base).code()).isEqualTo("INVALID_TAX_ID");
        base.put("taxId", "526-025-02-74");
        base.put("postalCode", "00950");
        assertThat(alice.put("/api/v1/tenants/" + tenant + "/store/settings", base).code()).isEqualTo("INVALID_POSTAL_CODE");
        base.put("postalCode", "00-950");
        base.put("legalCompanyName", "Firma Sp. z o.o.");
        var ok = alice.put("/api/v1/tenants/" + tenant + "/store/settings", base);
        assertThat(ok.status()).as(ok.body()).isEqualTo(200);
        assertThat(ok.json().get("taxId").asString()).isEqualTo("5260250274");
    }
}

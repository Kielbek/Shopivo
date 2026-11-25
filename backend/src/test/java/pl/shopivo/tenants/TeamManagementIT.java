package pl.shopivo.tenants;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

class TeamManagementIT extends IntegrationTest {

    @Test
    void invitationAcceptanceAndRolePermissions() {
        String ownerEmail = uniqueEmail("owner");
        ApiClient owner = registeredUser(ownerEmail);
        String tenant = createStore(owner, "Sklep Zespołu", uniqueSlug("team"));

        String pmEmail = uniqueEmail("pm");
        ApiClient pm = registeredUser(pmEmail);
        var invite = owner.post("/api/v1/tenants/" + tenant + "/invitations", Map.of("email", pmEmail, "role", "PRODUCT_MANAGER"));
        assertThat(invite.status()).as(invite.body()).isEqualTo(201);
        assertThat(owner.post("/api/v1/tenants/" + tenant + "/invitations", Map.of("email", pmEmail, "role", "ADMIN")).code())
                .isEqualTo("INVITATION_PENDING");
        String token = emails.awaitToken(pmEmail, "Zaproszenie");

        // Another account cannot use the invitation
        ApiClient intruder = registeredUser(uniqueEmail("intruder"));
        assertThat(intruder.post("/api/v1/invitations/accept", Map.of("token", token)).code()).isEqualTo("INVITATION_EMAIL_MISMATCH");

        var accepted = pm.post("/api/v1/invitations/accept", Map.of("token", token));
        assertThat(accepted.status()).as(accepted.body()).isEqualTo(200);
        assertThat(pm.post("/api/v1/invitations/accept", Map.of("token", token)).code()).isEqualTo("INVITATION_INVALID");

        // PRODUCT_MANAGER: can read store, cannot change settings or manage team
        assertThat(pm.get("/api/v1/tenants/" + tenant + "/store").status()).isEqualTo(200);
        assertThat(pm.get("/api/v1/tenants/" + tenant + "/members").status()).isEqualTo(403);
        var patch = pm.patch("/api/v1/tenants/" + tenant + "/store", Map.of("name", "Przejęta nazwa", "defaultLocale", "pl-PL",
                "defaultCurrency", "PLN", "timezone", "Europe/Warsaw", "version", 0));
        assertThat(patch.status()).isEqualTo(403);
        assertThat(patch.code()).isEqualTo("ACCESS_DENIED");
        assertThat(pm.get("/api/v1/stores").json().get(0).get("role").asString()).isEqualTo("PRODUCT_MANAGER");

        var members = owner.get("/api/v1/tenants/" + tenant + "/members").json();
        assertThat(members.size()).isEqualTo(2);
        String ownerMembership = null;
        String pmMembership = null;
        for (var m : members) {
            if (m.get("email").asString().equals(ownerEmail)) ownerMembership = m.get("membershipId").asString();
            if (m.get("email").asString().equals(pmEmail)) pmMembership = m.get("membershipId").asString();
        }

        // Owner cannot demote themselves (would also leave no owner)
        assertThat(owner.patch("/api/v1/tenants/" + tenant + "/members/" + ownerMembership, Map.of("role", "ADMIN")).code())
                .isEqualTo("CANNOT_MODIFY_SELF");

        // Promote PM to ADMIN; ADMIN cannot grant OWNER
        assertThat(owner.patch("/api/v1/tenants/" + tenant + "/members/" + pmMembership, Map.of("role", "ADMIN")).status()).isEqualTo(200);
        String other = uniqueEmail("other");
        ApiClient otherUser = registeredUser(other);
        pm.post("/api/v1/tenants/" + tenant + "/invitations", Map.of("email", other, "role", "MANAGER"));
        otherUser.post("/api/v1/invitations/accept", Map.of("token", emails.awaitToken(other, "Zaproszenie")));
        String otherMembership = null;
        for (var m : owner.get("/api/v1/tenants/" + tenant + "/members").json()) {
            if (m.get("email").asString().equals(other)) otherMembership = m.get("membershipId").asString();
        }
        assertThat(pm.patch("/api/v1/tenants/" + tenant + "/members/" + otherMembership, Map.of("role", "OWNER")).code())
                .isEqualTo("OWNER_ROLE_RESTRICTED");
        assertThat(pm.delete("/api/v1/tenants/" + tenant + "/members/" + ownerMembership).code()).isEqualTo("OWNER_ROLE_RESTRICTED");

        // Removing a member immediately revokes access
        assertThat(pm.delete("/api/v1/tenants/" + tenant + "/members/" + otherMembership).status()).isEqualTo(204);
        assertThat(otherUser.get("/api/v1/tenants/" + tenant + "/store").status()).isEqualTo(404);

        // Audit trail is recorded for the tenant
        var audit = owner.get("/api/v1/tenants/" + tenant + "/audit-logs").json().get("items");
        assertThat(audit.toString()).contains("team.member.removed", "team.invitation.accepted", "store.created");
    }

    @Test
    void ownerRoleCannotBeInvited() {
        ApiClient owner = registeredUser(uniqueEmail("own2"));
        String tenant = createStore(owner, "Sklep", uniqueSlug("own"));
        var res = owner.post("/api/v1/tenants/" + tenant + "/invitations", Map.of("email", uniqueEmail("x"), "role", "OWNER"));
        assertThat(res.code()).isEqualTo("OWNER_ROLE_RESTRICTED");
    }
}

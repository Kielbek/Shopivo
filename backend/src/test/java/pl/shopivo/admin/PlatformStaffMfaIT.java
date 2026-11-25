package pl.shopivo.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import org.apache.commons.codec.binary.Base32;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import pl.shopivo.users.PlatformRole;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** With the production default, platform staff privileges require a second factor on the account. */
@TestPropertySource(properties = "shopivo.security.require-platform-staff-mfa=true")
class PlatformStaffMfaIT extends IntegrationTest {

    @Autowired
    UserAccounts users;

    @Test
    void adminWithoutMfaHasNoPlatformPrivilegesUntilMfaIsEnabled() throws Exception {
        // Dedicated staff account: the shared bootstrap admin is used by other test classes.
        String email = uniqueEmail("staff");
        ApiClient admin = registeredUser(email);
        users.grantPlatformRole(users.findByEmail(email).orElseThrow().id(), PlatformRole.PLATFORM_ADMIN);
        assertThat(admin.get("/api/v1/auth/me").json().get("platformRole").isNull()).isTrue();
        assertThat(admin.get("/api/v1/admin/overview").status()).isEqualTo(403);

        String secret = admin.post("/api/v1/account/mfa/totp/setup", null).json().get("secret").asString();
        assertThat(admin.post("/api/v1/account/mfa/totp/confirm", Map.of("code", totp(secret, 0))).status()).isEqualTo(200);

        ApiClient withMfa = client();
        withMfa.post("/api/v1/auth/login", Map.of("email", email, "password", PASSWORD, "rememberMe", false));
        assertThat(withMfa.get("/api/v1/admin/overview").status()).isEqualTo(403);
        assertThat(withMfa.post("/api/v1/auth/login/mfa", Map.of("code", totp(secret, 1))).status()).isEqualTo(200);
        assertThat(withMfa.get("/api/v1/auth/me").json().get("platformRole").asString()).isEqualTo("PLATFORM_ADMIN");
        assertThat(withMfa.get("/api/v1/admin/overview").status()).isEqualTo(200);
    }

    /** RFC 6238 TOTP, independent re-implementation for the test. */
    private static String totp(String base32, long offset) throws Exception {
        byte[] key = new Base32().decode(base32);
        long step = Instant.now().getEpochSecond() / 30 + offset;
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA1");
        mac.init(new javax.crypto.spec.SecretKeySpec(key, "HmacSHA1"));
        byte[] h = mac.doFinal(java.nio.ByteBuffer.allocate(8).putLong(step).array());
        int o = h[h.length - 1] & 0xF;
        int bin = ((h[o] & 0x7F) << 24) | ((h[o + 1] & 0xFF) << 16) | ((h[o + 2] & 0xFF) << 8) | (h[o + 3] & 0xFF);
        return String.format("%06d", bin % 1_000_000);
    }
}

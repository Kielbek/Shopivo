package pl.shopivo.authentication.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

class MfaIT extends IntegrationTest {

    private static String code(String base32Secret, long stepOffset) {
        return Totp.code(Totp.fromBase32(base32Secret), Totp.currentStep(Instant.now()) + stepOffset);
    }

    @Test
    void totpSetupLoginAndRecoveryCodes() {
        String email = uniqueEmail("mfa");
        ApiClient client = registeredUser(email);

        var setup = client.post("/api/v1/account/mfa/totp/setup", null);
        assertThat(setup.status()).isEqualTo(200);
        String secret = setup.json().get("secret").asString();
        assertThat(setup.json().get("otpauthUri").asString()).startsWith("otpauth://totp/Shopivo%3A").contains("issuer=Shopivo");

        var wrong = client.post("/api/v1/account/mfa/totp/confirm", Map.of("code", "000000"));
        assertThat(wrong.code()).isEqualTo("MFA_CODE_INVALID");

        var confirm = client.post("/api/v1/account/mfa/totp/confirm", Map.of("code", code(secret, -1)));
        assertThat(confirm.status()).as(confirm.body()).isEqualTo(200);
        assertThat(confirm.json().get("recoveryCodes").size()).isEqualTo(10);
        String recovery = confirm.json().get("recoveryCodes").get(0).asString();
        emails.awaitEmail(email, "weryfikację dwuetapową");

        // Password step only grants MFA_PENDING
        ApiClient second = client();
        var login = second.post("/api/v1/auth/login", Map.of("email", email, "password", PASSWORD, "rememberMe", false));
        assertThat(login.json().get("mfaRequired").asBoolean()).isTrue();
        assertThat(second.get("/api/v1/auth/me").json().get("mfaPending").asBoolean()).isTrue();
        assertThat(second.get("/api/v1/stores").status()).isEqualTo(403);
        String pendingToken = second.cookie("__Host-shopivo_session");

        // The code used during confirmation cannot be replayed
        assertThat(second.post("/api/v1/auth/login/mfa", Map.of("code", code(secret, -1))).code()).isEqualTo("MFA_CODE_INVALID");
        var mfa = second.post("/api/v1/auth/login/mfa", Map.of("code", code(secret, 0)));
        assertThat(mfa.status()).as(mfa.body()).isEqualTo(200);
        assertThat(second.cookie("__Host-shopivo_session")).isNotEqualTo(pendingToken);
        assertThat(second.get("/api/v1/stores").status()).isEqualTo(200);

        // Old (pre-MFA) token is no longer valid after rotation
        ApiClient stale = client();
        stale.setCookie("__Host-shopivo_session", pendingToken);
        assertThat(stale.get("/api/v1/auth/me").status()).isEqualTo(401);

        // Recovery code works exactly once
        ApiClient third = client();
        third.post("/api/v1/auth/login", Map.of("email", email, "password", PASSWORD, "rememberMe", false));
        assertThat(third.post("/api/v1/auth/login/mfa", Map.of("code", recovery.toUpperCase())).status()).isEqualTo(200);
        ApiClient fourth = client();
        fourth.post("/api/v1/auth/login", Map.of("email", email, "password", PASSWORD, "rememberMe", false));
        assertThat(fourth.post("/api/v1/auth/login/mfa", Map.of("code", recovery)).code()).isEqualTo("MFA_CODE_INVALID");
        assertThat(third.get("/api/v1/account/mfa").json().get("remainingRecoveryCodes").asLong()).isEqualTo(9);
    }

    @Test
    void mfaVerificationIsRateLimited() {
        String email = uniqueEmail("mfa-rl");
        ApiClient client = registeredUser(email);
        String secret = client.post("/api/v1/account/mfa/totp/setup", null).json().get("secret").asString();
        client.post("/api/v1/account/mfa/totp/confirm", Map.of("code", code(secret, 0)));

        ApiClient attacker = client();
        attacker.post("/api/v1/auth/login", Map.of("email", email, "password", PASSWORD, "rememberMe", false));
        for (int i = 0; i < 5; i++) {
            assertThat(attacker.post("/api/v1/auth/login/mfa", Map.of("code", String.format("%06d", i))).status()).isEqualTo(422);
        }
        assertThat(attacker.post("/api/v1/auth/login/mfa", Map.of("code", "123456")).status()).isEqualTo(429);
    }
}

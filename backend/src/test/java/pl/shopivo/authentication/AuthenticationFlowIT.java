package pl.shopivo.authentication;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

class AuthenticationFlowIT extends IntegrationTest {

    private static final String SESSION_COOKIE = "__Host-shopivo_session";

    @Test
    void registerVerifyLoginMeLogout() {
        String email = uniqueEmail("flow");
        ApiClient client = registeredUser(email);

        assertThat(client.cookie(SESSION_COOKIE)).isNotBlank();
        var setCookie = String.join(";", client.post("/api/v1/auth/login",
                Map.of("email", email, "password", PASSWORD, "rememberMe", true)).raw().getHeaders("Set-Cookie"));
        assertThat(setCookie).contains("HttpOnly").contains("Secure").contains("SameSite=Lax").contains("Max-Age=");

        var me = client.get("/api/v1/auth/me");
        assertThat(me.status()).isEqualTo(200);
        assertThat(me.json().get("email").asString()).isEqualTo(email);
        assertThat(me.json().get("mfaPending").asBoolean()).isFalse();

        assertThat(client.post("/api/v1/auth/logout", null).status()).isEqualTo(204);
        assertThat(client.cookie(SESSION_COOKIE)).isNull();
        assertThat(client.get("/api/v1/auth/me").status()).isEqualTo(401);
    }

    @Test
    void revokedSessionTokenCannotBeReused() {
        String email = uniqueEmail("reuse");
        ApiClient client = registeredUser(email);
        String token = client.cookie(SESSION_COOKIE);
        client.post("/api/v1/auth/logout", null);

        ApiClient attacker = client();
        attacker.setCookie(SESSION_COOKIE, token);
        assertThat(attacker.get("/api/v1/auth/me").status()).isEqualTo(401);
    }

    @Test
    void loginRequiresVerifiedEmail() {
        String email = uniqueEmail("unverified");
        ApiClient client = client();
        client.post("/api/v1/auth/register", Map.of("email", email, "password", PASSWORD, "firstName", "A",
                "lastName", "B", "acceptTerms", true));
        var login = client.post("/api/v1/auth/login", Map.of("email", email, "password", PASSWORD, "rememberMe", false));
        assertThat(login.status()).isEqualTo(403);
        assertThat(login.code()).isEqualTo("EMAIL_NOT_VERIFIED");
    }

    @Test
    void registrationDoesNotRevealExistingAccounts() {
        String email = uniqueEmail("exists");
        registeredUser(email);
        var again = client().post("/api/v1/auth/register", Map.of("email", email.toUpperCase(), "password", PASSWORD,
                "firstName", "X", "lastName", "Y", "acceptTerms", true));
        assertThat(again.status()).isEqualTo(202);
        emails.awaitEmail(email, "Próba rejestracji");
    }

    @Test
    void registrationValidatesInputAndPasswordPolicy() {
        var invalid = client().post("/api/v1/auth/register", Map.of("email", "not-an-email", "password", PASSWORD,
                "firstName", "", "lastName", "B", "acceptTerms", false));
        assertThat(invalid.status()).isEqualTo(400);
        assertThat(invalid.code()).isEqualTo("VALIDATION_FAILED");
        assertThat(invalid.json().get("errors").toString()).contains("email", "firstName", "acceptTerms");

        var weak = client().post("/api/v1/auth/register", Map.of("email", uniqueEmail("weak"), "password", "password123",
                "firstName", "A", "lastName", "B", "acceptTerms", true));
        assertThat(weak.status()).isEqualTo(422);
        assertThat(weak.code()).isEqualTo("WEAK_PASSWORD");
    }

    @Test
    void wrongPasswordAndUnknownAccountLookIdentical() {
        String email = uniqueEmail("wrong");
        registeredUser(email);
        var wrong = client().post("/api/v1/auth/login", Map.of("email", email, "password", "Zle-Haslo-123456", "rememberMe", false));
        var unknown = client().post("/api/v1/auth/login", Map.of("email", uniqueEmail("nobody"), "password", "Zle-Haslo-123456", "rememberMe", false));
        assertThat(wrong.status()).isEqualTo(401);
        assertThat(unknown.status()).isEqualTo(401);
        assertThat(wrong.json().get("detail")).isEqualTo(unknown.json().get("detail"));
        assertThat(wrong.code()).isEqualTo("INVALID_CREDENTIALS");
    }

    @Test
    void accountIsLockedAfterRepeatedFailures() {
        String email = uniqueEmail("lock");
        registeredUser(email);
        for (int i = 0; i < 10; i++) {
            var r = client().post("/api/v1/auth/login", Map.of("email", email, "password", "Zle-Haslo-" + i + "xyz", "rememberMe", false));
            assertThat(r.status()).isEqualTo(401);
        }
        // Redis limits are cleared to prove the persistent account lock works independently of Redis.
        resetRateLimits();
        var locked = client().post("/api/v1/auth/login", Map.of("email", email, "password", PASSWORD, "rememberMe", false));
        assertThat(locked.status()).isEqualTo(429);
        assertThat(locked.code()).isEqualTo("RATE_LIMITED");
        assertThat(locked.raw().getHeader("Retry-After")).isNotNull();
    }

    @Test
    void csrfTokenIsRequiredForStateChangingRequests() {
        var res = client().postWithoutCsrf("/api/v1/auth/login",
                Map.of("email", "a@b.pl", "password", "whatever-123", "rememberMe", false));
        assertThat(res.status()).isEqualTo(403);
    }

    @Test
    void passwordResetRevokesAllSessions() {
        String email = uniqueEmail("reset");
        ApiClient first = registeredUser(email);
        ApiClient second = login(email, PASSWORD);

        assertThat(client().post("/api/v1/auth/password/forgot", Map.of("email", email)).status()).isEqualTo(202);
        assertThat(client().post("/api/v1/auth/password/forgot", Map.of("email", uniqueEmail("ghost"))).status()).isEqualTo(202);
        String token = emails.awaitToken(email, "Ustaw nowe hasło");

        String newPassword = "Nowe-Bezpieczne-Haslo-77";
        assertThat(client().post("/api/v1/auth/password/reset", Map.of("token", token, "newPassword", newPassword)).status())
                .isEqualTo(204);
        assertThat(first.get("/api/v1/auth/me").status()).isEqualTo(401);
        assertThat(second.get("/api/v1/auth/me").status()).isEqualTo(401);

        // Single use
        var reuse = client().post("/api/v1/auth/password/reset", Map.of("token", token, "newPassword", newPassword + "x"));
        assertThat(reuse.status()).isEqualTo(422);
        assertThat(reuse.code()).isEqualTo("TOKEN_INVALID");

        login(email, newPassword);
        emails.awaitEmail(email, "zostało zmienione");
    }

    @Test
    void changePasswordKeepsCurrentSessionAndRevokesOthers() {
        String email = uniqueEmail("change");
        ApiClient current = registeredUser(email);
        ApiClient other = login(email, PASSWORD);

        var bad = current.post("/api/v1/account/password", Map.of("currentPassword", "zle-haslo-xyz", "newPassword", "Inne-Haslo-2026-x"));
        assertThat(bad.code()).isEqualTo("INVALID_CURRENT_PASSWORD");

        assertThat(current.post("/api/v1/account/password",
                Map.of("currentPassword", PASSWORD, "newPassword", "Inne-Haslo-2026-x")).status()).isEqualTo(204);
        assertThat(current.get("/api/v1/auth/me").status()).isEqualTo(200);
        assertThat(other.get("/api/v1/auth/me").status()).isEqualTo(401);

        var sessions = current.get("/api/v1/account/sessions");
        assertThat(sessions.json().size()).isEqualTo(1);
        assertThat(sessions.json().get(0).get("current").asBoolean()).isTrue();
    }

    @Test
    void securityHeadersArePresent() {
        var res = client().get("/api/v1/auth/csrf");
        assertThat(res.raw().getHeader("Content-Security-Policy")).contains("frame-ancestors 'none'");
        assertThat(res.raw().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(res.raw().getHeader("Referrer-Policy")).isEqualTo("strict-origin-when-cross-origin");
    }
}

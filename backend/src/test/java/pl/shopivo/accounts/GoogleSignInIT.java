package pl.shopivo.accounts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** Customers sign in with Google through the store's own OAuth client; the secret stays encrypted and write-only. */
class GoogleSignInIT extends IntegrationTest {

    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    private String jdbcString(String tenant, String sql) {
        return pl.shopivo.shared.tenancy.TenantContext.callInTenant(java.util.UUID.fromString(tenant), () -> jdbc.queryForObject(sql, String.class, java.util.UUID.fromString(tenant)));
    }

    private static final String CLIENT_ID = "123456789-abc.apps.googleusercontent.com";
    private static final String SECRET = "GOCSPX-test-secret-123";

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    private MockHttpServletResponse sf(String host, String path, Cookie... cookies) throws Exception {
        var b = get("/api/v1/storefront" + path).header("Host", host);
        if (cookies.length > 0) b.cookie(cookies);
        return mvc.perform(b.with(r -> {
            r.setRemoteAddr("198.51.100." + (int) (Math.random() * 250 + 1));
            return r;
        })).andReturn().getResponse();
    }

    private MockHttpServletResponse json(String host, String path, Object body) throws Exception {
        return mvc.perform(post("/api/v1/storefront" + path).header("Host", host).header("X-Requested-With", "shopivo")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body))
                .with(req -> {
                    req.setRemoteAddr("203.0.113." + (int) (Math.random() * 250 + 1));
                    return req;
                })).andReturn().getResponse();
    }

    private static Map<String, String> query(String url) {
        Map<String, String> q = new HashMap<>();
        for (String p : URI.create(url).getRawQuery().split("&")) {
            String[] kv = p.split("=", 2);
            q.put(kv[0], URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
        }
        return q;
    }

    private static String cookieValue(MockHttpServletResponse r, String name) {
        for (String h : r.getHeaders("Set-Cookie")) {
            Matcher m = Pattern.compile(name + "=([^;]*)").matcher(h);
            if (m.find()) return m.group(1);
        }
        return null;
    }

    private static String claims(String email, String sub, String nonce) {
        return "{\"iss\":\"https://accounts.google.com\",\"aud\":\"" + CLIENT_ID + "\",\"sub\":\"" + sub + "\",\"email\":\"" + email
                + "\",\"email_verified\":true,\"given_name\":\"Anna\",\"family_name\":\"Nowak\",\"nonce\":\"" + nonce + "\",\"exp\":"
                + (Instant.now().getEpochSecond() + 600) + "}";
    }

    @Test
    void customersSignInWithTheStoresGoogleClient() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("google"));
        String slug = uniqueSlug("google");
        String t = createStore(owner, "Sklep Google", slug);
        Map<String, Object> variant = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "G-1", "priceMinor", 4000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        owner.post(base(t) + "/products", Map.of("name", "Kubek", "status", "ACTIVE", "variants", java.util.List.of(variant), "version", 0));
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1000, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0, "unpaidCancelDays", 7, "version", -1));
        publishStore(owner, t);
        String host = slug + ".shopivo.test";

        // Panel: nothing set; bad keys are refused; the secret is never returned
        var empty = owner.get(base(t) + "/google-sign-in").json();
        assertThat(empty.get("secretSet").asBoolean()).isFalse();
        assertThat(empty.get("redirectUris").get(0).asString()).isEqualTo("https://" + host + "/api/v1/storefront/account/google/callback");
        assertThat(owner.put(base(t) + "/google-sign-in", Map.of("clientId", "zly", "clientSecret", SECRET, "enabled", true, "version", -1)).code())
                .isEqualTo("INVALID_GOOGLE_CLIENT_ID");
        assertThat(owner.put(base(t) + "/google-sign-in", Map.of("clientId", CLIENT_ID, "clientSecret", "", "enabled", true, "version", -1)).code())
                .isEqualTo("GOOGLE_SECRET_REQUIRED");
        var saved = owner.put(base(t) + "/google-sign-in", Map.of("clientId", CLIENT_ID, "clientSecret", SECRET, "enabled", false, "version", -1));
        assertThat(saved.status()).isEqualTo(200);
        assertThat(saved.body()).doesNotContain(SECRET);
        assertThat(saved.json().get("secretSet").asBoolean()).isTrue();
        // Stored encrypted
        assertThat(jdbcString(t, "select client_secret_enc from store_google_sign_in where tenant_id = ?")).startsWith("v").doesNotContain(SECRET);

        // Off: no button, start goes back to the sign-in page
        assertThat(sf(host, "/store").getContentAsString().contains("\"googleSignIn\":false")).isTrue();
        assertThat(sf(host, "/account/google/start").getRedirectedUrl()).isEqualTo("/konto/logowanie?blad=google");

        // On (the secret stays when left empty)
        long v = saved.json().get("version").asLong();
        owner.put(base(t) + "/google-sign-in", Map.of("clientId", CLIENT_ID, "clientSecret", "", "enabled", true, "version", v));
        assertThat(sf(host, "/store").getContentAsString().contains("\"googleSignIn\":true")).isTrue();

        // Start: PKCE, state, nonce; the state is also kept in this browser's cookie
        var start = sf(host, "/account/google/start?powrot=/konto?zakladka=zamowienia");
        assertThat(start.getStatus()).isEqualTo(302);
        Map<String, String> q = query(start.getRedirectedUrl());
        assertThat(start.getRedirectedUrl()).startsWith("https://accounts.google.com/o/oauth2/v2/auth?");
        assertThat(q).containsEntry("client_id", CLIENT_ID).containsEntry("code_challenge_method", "S256").containsEntry("response_type", "code")
                .containsEntry("redirect_uri", "https://" + host + "/api/v1/storefront/account/google/callback");
        String state = cookieValue(start, "shopivo_oauth");
        assertThat(state).isEqualTo(q.get("state"));

        // Another browser's state (login CSRF) is refused without calling Google
        GOOGLE.calls.clear();
        var forged = sf(host, "/account/google/callback?state=" + q.get("state") + "&code=abc", new Cookie("shopivo_oauth", "inny"));
        assertThat(forged.getRedirectedUrl()).isEqualTo("/konto/logowanie?blad=google");
        assertThat(GOOGLE.calls).isEmpty();

        // Callback: Google returns the identity; a new verified account is created and signed in
        GOOGLE.next = claims("anna.google@example.com", "google-sub-1", q.get("nonce"));
        var back = sf(host, "/account/google/callback?state=" + q.get("state") + "&code=kod-1", new Cookie("shopivo_oauth", state));
        assertThat(back.getRedirectedUrl()).isEqualTo("/konto?zakladka=zamowienia");
        String session = cookieValue(back, "shopivo_customer");
        assertThat(session).isNotBlank();
        Map<String, String> exchange = GOOGLE.calls.getLast();
        assertThat(exchange).containsEntry("client_secret", SECRET).containsEntry("code", "kod-1").containsEntry("grant_type", "authorization_code");
        assertThat(challengeOf(exchange.get("code_verifier"))).isEqualTo(q.get("code_challenge"));
        var me = mvc.perform(get("/api/v1/storefront/account/me").header("Host", host).header("X-Requested-With", "shopivo")
                .cookie(new Cookie("shopivo_customer", session))).andReturn().getResponse();
        assertThat(me.getContentAsString()).contains("anna.google@example.com").contains("\"emailVerified\":true").contains("Anna");

        // The state is single use
        var replay = sf(host, "/account/google/callback?state=" + q.get("state") + "&code=kod-1", new Cookie("shopivo_oauth", state));
        assertThat(replay.getRedirectedUrl()).isEqualTo("/konto/logowanie?blad=google");

        // A wrong nonce (token not from this sign-in) is refused
        var start2 = sf(host, "/account/google/start");
        Map<String, String> q2 = query(start2.getRedirectedUrl());
        GOOGLE.next = claims("anna.google@example.com", "google-sub-1", "inny-nonce");
        assertThat(sf(host, "/account/google/callback?state=" + q2.get("state") + "&code=kod-2", new Cookie("shopivo_oauth", q2.get("state")))
                .getRedirectedUrl()).isEqualTo("/konto/logowanie?blad=google");

        // Another Google account with the same e-mail cannot take over the linked account
        var start3 = sf(host, "/account/google/start");
        Map<String, String> q3 = query(start3.getRedirectedUrl());
        GOOGLE.next = claims("anna.google@example.com", "google-sub-2", q3.get("nonce"));
        assertThat(sf(host, "/account/google/callback?state=" + q3.get("state") + "&code=kod-3", new Cookie("shopivo_oauth", q3.get("state")))
                .getRedirectedUrl()).isEqualTo("/konto/logowanie?blad=google-inne-konto");

        // Pre-account hijacking: someone registered the victim's address with their own password (never confirmed).
        // The victim then signs in with Google: the account is theirs and that password no longer works.
        String victim = uniqueEmail("ofiara");
        assertThat(json(host, "/account/register", Map.of("email", victim, "password", "Haslo-Napastnika-99", "firstName", "X", "lastName", "Y",
                "termsAccepted", true)).getStatus()).isEqualTo(202);
        var start4 = sf(host, "/account/google/start");
        Map<String, String> q4 = query(start4.getRedirectedUrl());
        GOOGLE.next = claims(victim, "google-sub-ofiara", q4.get("nonce"));
        assertThat(sf(host, "/account/google/callback?state=" + q4.get("state") + "&code=kod-4", new Cookie("shopivo_oauth", q4.get("state")))
                .getRedirectedUrl()).isEqualTo("/konto");
        assertThat(json(host, "/account/login", Map.of("email", victim, "password", "Haslo-Napastnika-99")).getContentAsString())
                .contains("INVALID_CREDENTIALS");

        // Removing the keys hides the button
        owner.delete(base(t) + "/google-sign-in");
        assertThat(sf(host, "/store").getContentAsString().contains("\"googleSignIn\":false")).isTrue();
    }

    private static String challengeOf(String verifier) throws Exception {
        byte[] h = java.security.MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(h);
    }
}

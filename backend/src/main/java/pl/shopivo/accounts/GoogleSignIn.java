package pl.shopivo.accounts;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.domains.DomainStatus;
import pl.shopivo.domains.StoreDomains;
import pl.shopivo.shared.crypto.SecretEncryptor;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.tenancy.TenantContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * "Zaloguj się przez Google" for a store's customers, with the store's own Google OAuth client.
 *
 * <ul>
 *   <li>The merchant creates the client in Google Cloud and enters its id and secret. The secret is encrypted
 *       (AES-256-GCM bound to the store) and never returned; the panel only learns that it is set.</li>
 *   <li>Authorization code flow with PKCE (S256), a random single-use {@code state} (stored hashed, 10 minutes, bound to
 *       the browser by an HttpOnly cookie) and a {@code nonce}.</li>
 *   <li>The ID token comes straight from Google's token endpoint over TLS with the client secret, so per OpenID Connect
 *       Core 3.1.3.7 its signature need not be checked; its claims are (issuer, audience, expiry, nonce, verified e-mail).</li>
 * </ul>
 */
@Service
public class GoogleSignIn {

    private static final Logger log = LoggerFactory.getLogger(GoogleSignIn.class);
    static final String AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    public static final Duration STATE_TTL = Duration.ofMinutes(10);
    private static final Pattern CLIENT_ID = Pattern.compile("^[0-9A-Za-z][0-9A-Za-z._-]{5,150}\\.apps\\.googleusercontent\\.com$");
    private static final Pattern SECRET = Pattern.compile("^[\\x21-\\x7e]{10,200}$");
    private static final Pattern RETURN_PATH = Pattern.compile("^/(?!/)[A-Za-z0-9/_\\-.?=&%]{0,200}$");
    private static final Set<String> ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");

    private final JdbcTemplate jdbc;
    private final SecretEncryptor encryptor;
    private final CustomerAccounts accounts;
    private final StoreDomains domains;
    private final AuditLog auditLog;
    private final JsonMapper json;
    private final TransactionTemplate tx;
    private final HttpClient http;
    private final String tokenUrl;

    GoogleSignIn(JdbcTemplate jdbc, SecretEncryptor encryptor, CustomerAccounts accounts, StoreDomains domains, AuditLog auditLog,
            JsonMapper json, TransactionTemplate tx, @Value("${shopivo.google.token-url:https://oauth2.googleapis.com/token}") String tokenUrl) {
        this.jdbc = jdbc;
        this.encryptor = encryptor;
        this.accounts = accounts;
        this.domains = domains;
        this.auditLog = auditLog;
        this.json = json;
        this.tx = tx;
        this.tokenUrl = tokenUrl;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    }

    // ------------------------------------------------------------------------------------------------ settings (panel)

    /** What the panel sees: never the secret, only whether it is set; and the redirect addresses to enter in Google. */
    public record Settings(String clientId, boolean secretSet, boolean enabled, List<String> redirectUris, long version) {
    }

    public record SettingsInput(String clientId, String clientSecret, boolean enabled, long version) {
    }

    record Stored(String clientId, String secretEnc, boolean enabled, long version) {
    }

    @Transactional(readOnly = true)
    public Settings settings() {
        Optional<Stored> s = stored();
        return new Settings(s.map(Stored::clientId).orElse(""), s.isPresent(), s.map(Stored::enabled).orElse(false), redirectUris(),
                s.map(Stored::version).orElse(-1L));
    }

    @Transactional
    public Settings save(SettingsInput in) {
        UUID tenant = TenantContext.requireTenantId();
        Optional<Stored> current = stored();
        long currentVersion = current.map(Stored::version).orElse(-1L);
        if (in.version() != currentVersion) throw new ConflictException("VERSION_CONFLICT", "Ustawienia zmieniono w innym oknie. Odśwież stronę.");
        String clientId = in.clientId() == null ? "" : in.clientId().strip();
        if (!CLIENT_ID.matcher(clientId).matches()) {
            throw new BusinessRuleException("INVALID_GOOGLE_CLIENT_ID", "Identyfikator klienta ma postać „…apps.googleusercontent.com”.");
        }
        String secret = in.clientSecret() == null ? "" : in.clientSecret().strip();
        String encrypted;
        if (secret.isEmpty()) {
            encrypted = current.map(Stored::secretEnc)
                    .orElseThrow(() -> new BusinessRuleException("GOOGLE_SECRET_REQUIRED", "Podaj klucz klienta (client secret)."));
        } else {
            if (!SECRET.matcher(secret).matches()) throw new BusinessRuleException("INVALID_GOOGLE_SECRET", "Klucz klienta wygląda na niepełny.");
            encrypted = encryptor.encrypt(secret, aad(tenant));
        }
        jdbc.update("""
                insert into store_google_sign_in (tenant_id, client_id, client_secret_enc, enabled, updated_by)
                values (?, ?, ?, ?, ?)
                on conflict (tenant_id) do update set client_id = excluded.client_id, client_secret_enc = excluded.client_secret_enc,
                    enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now(), version = store_google_sign_in.version + 1
                """, tenant, clientId, encrypted, in.enabled(), TenantContext.userId().orElse(null));
        auditLog.record(AuditEntry.tenant("store.google_sign_in.saved", tenant, "google_sign_in", null)
                .with(Map.of("enabled", in.enabled(), "secretChanged", !secret.isEmpty())));
        return settings();
    }

    /** Removes the keys: the button disappears from the store. Accounts keep working (password or a reset link). */
    @Transactional
    public void remove() {
        UUID tenant = TenantContext.requireTenantId();
        if (jdbc.update("delete from store_google_sign_in where tenant_id = ?", tenant) > 0) {
            auditLog.record(AuditEntry.tenant("store.google_sign_in.removed", tenant, "google_sign_in", null));
        }
    }

    /** Callback addresses to enter in Google Cloud ("Authorized redirect URIs"): one per active domain of the store. */
    private List<String> redirectUris() {
        return domains.currentTenantDomains().stream().filter(d -> d.status() == DomainStatus.ACTIVE || d.primary())
                .map(d -> "https://" + d.hostname() + CALLBACK_PATH).distinct().toList();
    }

    public static final String CALLBACK_PATH = "/api/v1/storefront/account/google/callback";

    // ------------------------------------------------------------------------------------------------ storefront

    @Transactional(readOnly = true)
    public boolean enabled() {
        return stored().filter(Stored::enabled).isPresent();
    }

    /** Where to send the browser, and the state value to remember in its cookie. */
    public record Start(String authorizeUrl, String state) {
    }

    @Transactional
    public Start start(String redirectUri, String returnPath) {
        UUID tenant = TenantContext.requireTenantId();
        Stored s = stored().filter(Stored::enabled)
                .orElseThrow(() -> new BusinessRuleException("GOOGLE_SIGN_IN_DISABLED", "Logowanie przez Google jest wyłączone."));
        String state = Tokens.newToken();
        String verifier = Tokens.newToken() + Tokens.newToken();
        String nonce = Tokens.newToken();
        jdbc.update("delete from customer_oauth_states where tenant_id = ? and expires_at < now()", tenant);
        jdbc.update("""
                insert into customer_oauth_states (state_hash, tenant_id, code_verifier, nonce, redirect_uri, return_path, expires_at)
                values (?, ?, ?, ?, ?, ?, ?)
                """, Tokens.sha256(state), tenant, verifier, nonce, redirectUri, safeReturn(returnPath),
                java.sql.Timestamp.from(Instant.now().plus(STATE_TTL)));
        Map<String, String> q = new LinkedHashMap<>();
        q.put("client_id", s.clientId());
        q.put("redirect_uri", redirectUri);
        q.put("response_type", "code");
        q.put("scope", "openid email profile");
        q.put("state", state);
        q.put("nonce", nonce);
        q.put("code_challenge", challenge(verifier));
        q.put("code_challenge_method", "S256");
        q.put("prompt", "select_account");
        return new Start(AUTHORIZE_URL + "?" + form(q), state);
    }

    /** Signed in: the session token and where to go back to. */
    public record Result(String session, String returnPath) {
    }

    record Pending(String verifier, String nonce, String redirectUri, String returnPath) {
    }

    /** Completes the sign-in. The state is consumed first (single use), Google is called outside any transaction. */
    public Result finish(String state, String code) {
        UUID tenant = TenantContext.requireTenantId();
        if (state == null || code == null || code.isBlank() || code.length() > 2000) throw failed("missing state or code");
        Pending p = tx.execute(x -> jdbc.query("""
                delete from customer_oauth_states where state_hash = ? and tenant_id = ? and expires_at > now()
                returning code_verifier, nonce, redirect_uri, return_path
                """, (rs, i) -> new Pending(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)),
                Tokens.sha256(state), tenant).stream().findFirst().orElse(null));
        if (p == null) throw failed("unknown or expired state");
        Stored s = tx.execute(x -> stored()).filter(Stored::enabled).orElseThrow(() -> failed("disabled"));
        JsonNode token = exchange(s, p, code);
        CustomerAccounts.GoogleIdentity identity = identity(token.path("id_token").asString(""), s.clientId(), p.nonce());
        return new Result(accounts.googleSignIn(identity), p.returnPath());
    }

    private JsonNode exchange(Stored s, Pending p, String code) {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("client_id", s.clientId());
        body.put("client_secret", encryptor.decrypt(s.secretEnc(), aad(TenantContext.requireTenantId())));
        body.put("redirect_uri", p.redirectUri());
        body.put("grant_type", "authorization_code");
        body.put("code_verifier", p.verifier());
        try {
            HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(tokenUrl)).timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/x-www-form-urlencoded").header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(form(body))).build(), HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() != 200) {
                // Google's error code only (e.g. invalid_client, invalid_grant) — never the body's secrets
                log.warn("Google token exchange failed: {} {}", r.statusCode(), json.readTree(r.body()).path("error").asString("?"));
                throw failed("token endpoint " + r.statusCode());
            }
            return json.readTree(r.body());
        } catch (java.io.IOException e) {
            throw failed("token endpoint unreachable");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw failed("interrupted");
        }
    }

    /** Claims of the ID token received directly from Google (see the class comment). */
    CustomerAccounts.GoogleIdentity identity(String idToken, String clientId, String nonce) {
        String[] parts = idToken.split("\\.");
        if (parts.length != 3) throw failed("no id_token");
        JsonNode c;
        try {
            c = json.readTree(new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8));
        } catch (RuntimeException e) {
            throw failed("unreadable id_token");
        }
        if (!ISSUERS.contains(c.path("iss").asString(""))) throw failed("issuer");
        JsonNode aud = c.path("aud");
        boolean audienceOk = aud.isArray() ? java.util.stream.StreamSupport.stream(aud.spliterator(), false).anyMatch(a -> clientId.equals(a.asString()))
                : clientId.equals(aud.asString(""));
        if (!audienceOk) throw failed("audience");
        if (c.path("exp").asLong(0) < Instant.now().getEpochSecond() - 60) throw failed("expired");
        if (!Tokens.constantTimeEquals(nonce, c.path("nonce").asString(""))) throw failed("nonce");
        if (!c.path("email_verified").asBoolean(false) || c.path("email").asString("").isBlank()) {
            throw new BusinessRuleException("GOOGLE_EMAIL_NOT_VERIFIED", "Konto Google nie ma potwierdzonego adresu e-mail.");
        }
        String sub = c.path("sub").asString("");
        if (sub.isEmpty() || sub.length() > 255) throw failed("subject");
        return new CustomerAccounts.GoogleIdentity(sub, c.path("email").asString(), c.path("given_name").asString(null), c.path("family_name").asString(null));
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private Optional<Stored> stored() {
        return jdbc.query("select client_id, client_secret_enc, enabled, version from store_google_sign_in where tenant_id = ?",
                (rs, i) -> new Stored(rs.getString(1), rs.getString(2), rs.getBoolean(3), rs.getLong(4)), TenantContext.requireTenantId())
                .stream().findFirst();
    }

    private static String aad(UUID tenant) {
        return "google-sign-in:" + tenant;
    }

    static String safeReturn(String path) {
        return path != null && RETURN_PATH.matcher(path).matches() ? path : "/konto";
    }

    static String challenge(String verifier) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String form(Map<String, String> values) {
        return values.entrySet().stream().map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
    }

    /** Sign-in failed; details go to the log (no tokens), the customer sees one general message. */
    private static BusinessRuleException failed(String why) {
        log.info("Google sign-in rejected: {}", why);
        return new BusinessRuleException("GOOGLE_SIGN_IN_FAILED", "Nie udało się zalogować przez Google. Spróbuj ponownie.");
    }
}

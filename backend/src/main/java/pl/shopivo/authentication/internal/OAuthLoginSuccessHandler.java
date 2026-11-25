package pl.shopivo.authentication.internal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.web.ClientInfo;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserCredentials;
import pl.shopivo.users.UserStatus;
import pl.shopivo.users.UserView;

/**
 * Completes "Sign in with Google": finds or links the account, issues our own session cookie and redirects to the
 * merchant dashboard. Only identities with a verified e-mail are accepted.
 */
@Component
class OAuthLoginSuccessHandler implements AuthenticationSuccessHandler {

    private static final Logger log = LoggerFactory.getLogger(OAuthLoginSuccessHandler.class);

    private final UserAccounts users;
    private final OAuthIdentityRepository identities;
    private final SessionService sessions;
    private final SessionCookies cookies;
    private final AuditLog auditLog;
    private final TransactionTemplate tx;
    private final ShopivoProperties properties;

    OAuthLoginSuccessHandler(UserAccounts users, OAuthIdentityRepository identities, SessionService sessions,
            SessionCookies cookies, AuditLog auditLog, TransactionTemplate tx, ShopivoProperties properties) {
        this.users = users;
        this.identities = identities;
        this.sessions = sessions;
        this.cookies = cookies;
        this.auditLog = auditLog;
        this.tx = tx;
        this.properties = properties;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException {
        invalidateHttpSession(request);
        SecurityContextHolder.clearContext();
        if (!(authentication instanceof OAuth2AuthenticationToken token) || !(token.getPrincipal() instanceof OidcUser oidc)) {
            redirect(response, "/logowanie?blad=oauth");
            return;
        }
        String provider = token.getAuthorizedClientRegistrationId().toUpperCase();
        if (!Boolean.TRUE.equals(oidc.getEmailVerified()) || oidc.getEmail() == null) {
            redirect(response, "/logowanie?blad=oauth-email");
            return;
        }
        UUID userId = tx.execute(s -> resolveUser(provider, oidc));
        UserCredentials user = users.credentialsById(userId);
        if (user.status() != UserStatus.ACTIVE) {
            redirect(response, "/logowanie?blad=konto-zablokowane");
            return;
        }
        SessionService.IssuedSession session = tx.execute(s -> {
            users.recordSuccessfulLogin(userId);
            auditLog.record(new AuditEntry("auth.login.succeeded", null, "user", userId.toString(),
                    Map.of("provider", provider, "mfaRequired", user.mfaEnabled())));
            return sessions.create(userId, true, !user.mfaEnabled(), ClientInfo.from(request));
        });
        cookies.write(response, session);
        redirect(response, user.mfaEnabled() ? "/logowanie/weryfikacja" : "/");
    }

    void onFailure(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {
        log.info("OAuth login failed: {}", exception.getMessage());
        invalidateHttpSession(request);
        redirect(response, "/logowanie?blad=oauth");
    }

    private UUID resolveUser(String provider, OidcUser oidc) {
        Optional<OAuthIdentityEntity> identity = identities.findByProviderAndSubject(provider, oidc.getSubject());
        if (identity.isPresent()) {
            return identity.get().getUserId();
        }
        String email = UserAccounts.normalizeEmail(oidc.getEmail());
        UUID userId = users.findByEmail(email)
                .map(existing -> {
                    users.confirmMailboxOwnershipViaProvider(existing.id());
                    return existing.id();
                })
                .orElseGet(() -> {
                    String first = Optional.ofNullable(oidc.getGivenName()).orElse("");
                    String last = Optional.ofNullable(oidc.getFamilyName()).orElse("");
                    UserView created = users.register(email, first.isBlank() ? email.split("@")[0] : first, last, null,
                            true, AuthenticationService.TERMS_VERSION);
                    auditLog.record(AuditEntry.platform("auth.registered", "user", created.id())
                            .with(Map.of("provider", provider)));
                    return created.id();
                });
        identities.save(new OAuthIdentityEntity(userId, provider, oidc.getSubject(), email));
        auditLog.record(AuditEntry.platform("auth.oauth.linked", "user", userId).with(Map.of("provider", provider)));
        return userId;
    }

    private static void invalidateHttpSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }

    private void redirect(HttpServletResponse response, String path) throws IOException {
        response.sendRedirect(properties.appUrl() + path);
    }
}

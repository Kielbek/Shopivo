package pl.shopivo.authentication.internal;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.ApiException;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.RateLimitedException;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.web.ClientInfo;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserCredentials;
import pl.shopivo.users.UserStatus;
import pl.shopivo.users.UserView;

@Service
public class AuthenticationService {

    private static final Logger log = LoggerFactory.getLogger(AuthenticationService.class);
    public static final String TERMS_VERSION = "2026-11";

    private final UserAccounts users;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final SessionService sessions;
    private final OneTimeTokens tokens;
    private final RateLimiter rateLimiter;
    private final AuditLog auditLog;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate tx;
    private final ShopivoProperties.Login loginConfig;
    private final String dummyHash;

    AuthenticationService(UserAccounts users, PasswordEncoder passwordEncoder, PasswordPolicy passwordPolicy,
            SessionService sessions, OneTimeTokens tokens, RateLimiter rateLimiter, AuditLog auditLog,
            ApplicationEventPublisher events, TransactionTemplate tx, ShopivoProperties properties) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.sessions = sessions;
        this.tokens = tokens;
        this.rateLimiter = rateLimiter;
        this.auditLog = auditLog;
        this.events = events;
        this.tx = tx;
        this.loginConfig = properties.security().login();
        this.dummyHash = passwordEncoder.encode("timing-equalization-" + Tokens.newToken());
    }

    public record LoginResult(SessionService.IssuedSession session, boolean mfaRequired) {
    }

    // ------------------------------------------------------------------ registration

    @Transactional
    public void register(String email, String password, String firstName, String lastName, ClientInfo client) {
        rateLimiter.consume("register:ip:" + client.ipAddress(), 5, Duration.ofMinutes(1));
        String normalized = UserAccounts.normalizeEmail(email);
        passwordPolicy.validate(password, normalized);
        Optional<UserView> existing = users.findByEmail(normalized);
        if (existing.isPresent()) {
            // Same response as a successful registration — prevents account enumeration.
            events.publishEvent(new AuthEvents.RegistrationAttemptOnExistingAccount(existing.get().id()));
            return;
        }
        UserView user = users.register(normalized, firstName, lastName, passwordEncoder.encode(password), false, TERMS_VERSION);
        auditLog.record(AuditEntry.platform("auth.registered", "user", user.id()));
        events.publishEvent(new AuthEvents.VerificationEmailRequested(user.id()));
    }

    @Transactional
    public void verifyEmail(String token) {
        UUID userId = tokens.consume(token, UserTokenEntity.Purpose.EMAIL_VERIFICATION)
                .orElseThrow(() -> new BusinessRuleException("TOKEN_INVALID", "Link jest nieprawidłowy lub wygasł."));
        users.markEmailVerified(userId);
        auditLog.record(AuditEntry.platform("auth.email.verified", "user", userId));
    }

    @Transactional
    public void resendVerification(String email, ClientInfo client) {
        rateLimiter.consume("verify-resend:ip:" + client.ipAddress(), 5, Duration.ofMinutes(1));
        rateLimiter.consume("verify-resend:email:" + Tokens.sha256(String.valueOf(UserAccounts.normalizeEmail(email))),
                3, Duration.ofHours(1));
        users.findByEmail(email).filter(u -> !u.emailVerified())
                .ifPresent(u -> events.publishEvent(new AuthEvents.VerificationEmailRequested(u.id())));
    }

    // ------------------------------------------------------------------ login

    /**
     * Password login. Failed attempts are counted per account (persistent, escalating lock) and rate limited per
     * IP and per e-mail (Redis). Responses do not reveal whether an account exists.
     */
    public LoginResult login(String email, String password, boolean rememberMe, ClientInfo client) {
        String normalized = UserAccounts.normalizeEmail(email);
        rateLimiter.consume("login:ip:" + client.ipAddress(), 20, Duration.ofMinutes(1));
        rateLimiter.consume("login:email:" + Tokens.sha256(normalized), loginConfig.maxFailedAttempts(), Duration.ofMinutes(15));

        Optional<UserCredentials> found = users.credentialsByEmail(normalized);
        if (found.isEmpty()) {
            passwordEncoder.matches(password, dummyHash);
            auditFailure(null, "UNKNOWN_ACCOUNT");
            throw invalidCredentials();
        }
        UserCredentials user = found.get();
        if (user.isLocked(Instant.now())) {
            passwordEncoder.matches(password, dummyHash);
            auditFailure(user.id(), "LOCKED");
            throw new RateLimitedException(Duration.between(Instant.now(), user.lockedUntil()));
        }
        if (user.passwordHash() == null || !passwordEncoder.matches(password, user.passwordHash())) {
            tx.executeWithoutResult(s -> {
                users.recordFailedLogin(user.id(), loginConfig.maxFailedAttempts(), loginConfig.lockDuration());
                auditFailure(user.id(), "BAD_PASSWORD");
            });
            throw invalidCredentials();
        }
        if (user.status() == UserStatus.SUSPENDED || user.status() == UserStatus.DELETED) {
            auditFailure(user.id(), "SUSPENDED");
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_SUSPENDED",
                    "Konto zostało zablokowane. Skontaktuj się z pomocą techniczną.");
        }
        if (!user.emailVerified()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED",
                    "Potwierdź adres e-mail, klikając link z wiadomości, którą do Ciebie wysłaliśmy.");
        }
        return tx.execute(s -> {
            users.recordSuccessfulLogin(user.id());
            if (passwordEncoder.upgradeEncoding(user.passwordHash())) {
                users.changePasswordHash(user.id(), passwordEncoder.encode(password));
            }
            SessionService.IssuedSession session = sessions.create(user.id(), rememberMe, !user.mfaEnabled(), client);
            auditLog.record(AuditEntry.platform("auth.login.succeeded", "user", user.id())
                    .with(Map.of("mfaRequired", user.mfaEnabled())));
            rateLimiter.reset("login:email:" + Tokens.sha256(normalized));
            return new LoginResult(session, user.mfaEnabled());
        });
    }

    @Transactional
    public void logout(UUID sessionId) {
        sessions.revoke(sessionId, "LOGOUT");
    }

    // ------------------------------------------------------------------ password reset

    @Transactional
    public void requestPasswordReset(String email, ClientInfo client) {
        rateLimiter.consume("pwreset:ip:" + client.ipAddress(), 5, Duration.ofMinutes(1));
        rateLimiter.consume("pwreset:email:" + Tokens.sha256(String.valueOf(UserAccounts.normalizeEmail(email))),
                3, Duration.ofHours(1));
        users.findByEmail(email).ifPresent(u -> events.publishEvent(new AuthEvents.PasswordResetRequested(u.id())));
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        UUID userId = tokens.consume(token, UserTokenEntity.Purpose.PASSWORD_RESET)
                .orElseThrow(() -> new BusinessRuleException("TOKEN_INVALID", "Link jest nieprawidłowy lub wygasł."));
        UserView user = users.getById(userId);
        passwordPolicy.validate(newPassword, user.email());
        users.changePasswordHash(userId, passwordEncoder.encode(newPassword));
        // Following the link proves control of the mailbox.
        users.markEmailVerified(userId);
        int revoked = sessions.revokeAll(userId, null, "PASSWORD_RESET");
        auditLog.record(AuditEntry.platform("auth.password.reset", "user", userId).with(Map.of("revokedSessions", revoked)));
        events.publishEvent(new AuthEvents.PasswordChanged(userId));
        log.info("Password reset completed for user {}", userId);
    }

    @Transactional
    public void changePassword(UUID userId, UUID currentSessionId, String currentPassword, String newPassword) {
        UserCredentials creds = users.credentialsById(userId);
        if (creds.passwordHash() == null || !passwordEncoder.matches(currentPassword, creds.passwordHash())) {
            throw new BusinessRuleException("INVALID_CURRENT_PASSWORD", "Obecne hasło jest nieprawidłowe.");
        }
        passwordPolicy.validate(newPassword, creds.email());
        users.changePasswordHash(userId, passwordEncoder.encode(newPassword));
        int revoked = sessions.revokeAll(userId, currentSessionId, "PASSWORD_CHANGED");
        auditLog.record(AuditEntry.platform("auth.password.changed", "user", userId).with(Map.of("revokedSessions", revoked)));
        events.publishEvent(new AuthEvents.PasswordChanged(userId));
    }

    private void auditFailure(UUID userId, String reason) {
        auditLog.record(new AuditEntry("auth.login.failed", null, "user", userId == null ? null : userId.toString(),
                Map.of("reason", reason)));
    }

    private static ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Nieprawidłowy e-mail lub hasło.");
    }
}

package pl.shopivo.authentication.internal;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.OptionalLong;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.crypto.SecretEncryptor;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserCredentials;

/** TOTP second factor with single-use recovery codes. Secrets are AES-GCM encrypted, bound to the user id. */
@Service
@Transactional
public class MfaService {

    private static final int RECOVERY_CODES = 10;
    private static final char[] RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789".toCharArray();

    private final MfaTotpRepository totps;
    private final RecoveryCodeRepository recoveryCodes;
    private final SecretEncryptor encryptor;
    private final UserAccounts users;
    private final SessionService sessions;
    private final PasswordEncoder passwordEncoder;
    private final RateLimiter rateLimiter;
    private final AuditLog auditLog;
    private final ApplicationEventPublisher events;

    MfaService(MfaTotpRepository totps, RecoveryCodeRepository recoveryCodes, SecretEncryptor encryptor,
            UserAccounts users, SessionService sessions, PasswordEncoder passwordEncoder, RateLimiter rateLimiter,
            AuditLog auditLog, ApplicationEventPublisher events) {
        this.totps = totps;
        this.recoveryCodes = recoveryCodes;
        this.encryptor = encryptor;
        this.users = users;
        this.sessions = sessions;
        this.passwordEncoder = passwordEncoder;
        this.rateLimiter = rateLimiter;
        this.auditLog = auditLog;
        this.events = events;
    }

    public record TotpSetup(String secret, String otpauthUri) {
    }

    public TotpSetup startSetup(UUID userId) {
        UserCredentials user = users.credentialsById(userId);
        if (user.mfaEnabled()) {
            throw new BusinessRuleException("MFA_ALREADY_ENABLED", "Weryfikacja dwuetapowa jest już włączona.");
        }
        byte[] secret = Totp.newSecret();
        String encrypted = encryptor.encrypt(Totp.toBase32(secret), aad(userId));
        totps.findById(userId).ifPresentOrElse(t -> t.replaceSecret(encrypted),
                () -> totps.save(new MfaTotpEntity(userId, encrypted)));
        String base32 = Totp.toBase32(secret);
        String label = URLEncoder.encode("Shopivo:" + user.email(), StandardCharsets.UTF_8).replace("+", "%20");
        String uri = "otpauth://totp/" + label + "?secret=" + base32 + "&issuer=Shopivo&algorithm=SHA1&digits="
                + Totp.DIGITS + "&period=" + Totp.PERIOD_SECONDS;
        return new TotpSetup(base32, uri);
    }

    /** Confirms setup with a valid code; returns the recovery codes (shown to the user exactly once). */
    public List<String> confirmSetup(UUID userId, UUID sessionId, String code) {
        rateLimiter.consume("mfa-setup:" + userId, 10, Duration.ofMinutes(10));
        MfaTotpEntity totp = totps.findById(userId)
                .orElseThrow(() -> new BusinessRuleException("MFA_SETUP_NOT_STARTED", "Najpierw rozpocznij konfigurację."));
        if (totp.isConfirmed()) {
            throw new BusinessRuleException("MFA_ALREADY_ENABLED", "Weryfikacja dwuetapowa jest już włączona.");
        }
        OptionalLong step = Totp.verify(secretOf(totp, userId), code, Instant.now(), null);
        if (step.isEmpty()) {
            throw new BusinessRuleException("MFA_CODE_INVALID", "Nieprawidłowy kod. Sprawdź czas w telefonie i spróbuj ponownie.");
        }
        totp.confirm(Instant.now(), step.getAsLong());
        users.setMfaEnabled(userId, true);
        List<String> codes = regenerateRecoveryCodes(userId);
        sessions.revokeAll(userId, sessionId, "MFA_ENABLED");
        auditLog.record(AuditEntry.platform("auth.mfa.enabled", "user", userId));
        events.publishEvent(new AuthEvents.MfaEnabled(userId));
        return codes;
    }

    public void disable(UUID userId, String password, String code) {
        rateLimiter.consume("mfa-disable:" + userId, 5, Duration.ofMinutes(15));
        UserCredentials user = users.credentialsById(userId);
        if (user.passwordHash() == null || !passwordEncoder.matches(password, user.passwordHash())) {
            throw new BusinessRuleException("INVALID_CURRENT_PASSWORD", "Obecne hasło jest nieprawidłowe.");
        }
        if (!verifySecondFactor(userId, code)) {
            throw new BusinessRuleException("MFA_CODE_INVALID", "Nieprawidłowy kod weryfikacyjny.");
        }
        totps.deleteById(userId);
        recoveryCodes.deleteAllForUser(userId);
        users.setMfaEnabled(userId, false);
        auditLog.record(AuditEntry.platform("auth.mfa.disabled", "user", userId));
    }

    /** Second login step. On success the session is elevated and its token rotated. */
    public SessionService.IssuedSession completeLogin(UUID userId, UUID sessionId, String code) {
        rateLimiter.consume("mfa-login:" + sessionId, 5, Duration.ofMinutes(5));
        // Per account as well: someone who knows the password could otherwise open new sessions to keep guessing.
        rateLimiter.consume("mfa-login-user:" + userId, 10, Duration.ofMinutes(15));
        if (!verifySecondFactor(userId, code)) {
            auditLog.record(AuditEntry.platform("auth.mfa.failed", "user", userId));
            throw new BusinessRuleException("MFA_CODE_INVALID", "Nieprawidłowy kod weryfikacyjny.");
        }
        auditLog.record(AuditEntry.platform("auth.mfa.succeeded", "user", userId));
        return sessions.elevateAfterMfa(sessionId);
    }

    public long remainingRecoveryCodes(UUID userId) {
        return recoveryCodes.countUnused(userId);
    }

    public List<String> regenerateRecoveryCodes(UUID userId) {
        recoveryCodes.deleteAllForUser(userId);
        List<String> codes = new ArrayList<>(RECOVERY_CODES);
        for (int i = 0; i < RECOVERY_CODES; i++) {
            String code = randomCode(5) + "-" + randomCode(5);
            codes.add(code);
            recoveryCodes.save(new RecoveryCodeEntity(userId, Tokens.sha256(normalizeRecovery(code))));
        }
        return codes;
    }

    private boolean verifySecondFactor(UUID userId, String code) {
        if (code == null) {
            return false;
        }
        String trimmed = code.trim();
        if (trimmed.matches("\\d{6}")) {
            return totps.findById(userId).filter(MfaTotpEntity::isConfirmed).map(totp -> {
                OptionalLong step = Totp.verify(secretOf(totp, userId), trimmed, Instant.now(), totp.getLastUsedStep());
                step.ifPresent(totp::markUsed);
                return step.isPresent();
            }).orElse(false);
        }
        return recoveryCodes.findByUserIdAndCodeHash(userId, Tokens.sha256(normalizeRecovery(trimmed)))
                .filter(RecoveryCodeEntity::isUnused)
                .map(rc -> {
                    rc.use(Instant.now());
                    auditLog.record(AuditEntry.platform("auth.mfa.recovery_code_used", "user", userId));
                    return true;
                })
                .orElse(false);
    }

    private byte[] secretOf(MfaTotpEntity totp, UUID userId) {
        return Totp.fromBase32(encryptor.decrypt(totp.getSecretEncrypted(), aad(userId)));
    }

    private static String aad(UUID userId) {
        return "mfa-totp:" + userId;
    }

    private static String normalizeRecovery(String code) {
        return code.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static String randomCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(RECOVERY_ALPHABET[Tokens.random().nextInt(RECOVERY_ALPHABET.length)]);
        }
        return sb.toString();
    }
}

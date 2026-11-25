package pl.shopivo.authentication.internal;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.web.ClientInfo;

/** Server-side sessions identified by an opaque random token; only its SHA-256 hash is stored (ADR-004). */
@Service
@Transactional
public class SessionService {

    private final UserSessionRepository sessions;
    private final ShopivoProperties.Session config;

    SessionService(UserSessionRepository sessions, ShopivoProperties properties) {
        this.sessions = sessions;
        this.config = properties.security().session();
    }

    public record IssuedSession(UUID id, String token, boolean rememberMe, Instant absoluteExpiresAt) {
    }

    public record ActiveSession(UUID id, UUID userId, boolean mfaVerified) {
    }

    public record SessionInfo(UUID id, Instant createdAt, Instant lastSeenAt, String ipAddress, String userAgent, boolean current) {
    }

    public IssuedSession create(UUID userId, boolean rememberMe, boolean mfaVerified, ClientInfo client) {
        String token = Tokens.newToken();
        Instant now = Instant.now();
        UserSessionEntity session = sessions.save(new UserSessionEntity(userId, Tokens.sha256(token), now,
                idleTimeout(rememberMe), config.absoluteTimeout(), rememberMe, mfaVerified, client.ipAddress(),
                client.userAgent()));
        return new IssuedSession(session.getId(), token, rememberMe, session.getAbsoluteExpiresAt());
    }

    /** Validates a session token and extends its idle lifetime (at most once per touch interval). */
    public Optional<ActiveSession> resolve(String token) {
        if (token == null || token.isBlank() || token.length() > 100) {
            return Optional.empty();
        }
        Instant now = Instant.now();
        return sessions.findByTokenHash(Tokens.sha256(token))
                .filter(s -> s.isActive(now))
                .map(s -> {
                    s.touchIfDue(now, idleTimeout(s.isRememberMe()), config.touchInterval());
                    return new ActiveSession(s.getId(), s.getUserId(), s.isMfaVerified());
                });
    }

    /** Marks the second factor as verified and rotates the token (prevents session fixation). */
    public IssuedSession elevateAfterMfa(UUID sessionId) {
        UserSessionEntity session = sessions.findById(sessionId).orElseThrow(NotFoundException::new);
        String token = Tokens.newToken();
        session.elevate(Tokens.sha256(token));
        return new IssuedSession(session.getId(), token, session.isRememberMe(), session.getAbsoluteExpiresAt());
    }

    public void revoke(UUID sessionId, String reason) {
        sessions.findById(sessionId).ifPresent(s -> s.revoke(Instant.now(), reason));
    }

    public void revokeOwnSession(UUID userId, UUID sessionId) {
        UserSessionEntity session = sessions.findById(sessionId)
                .filter(s -> s.getUserId().equals(userId))
                .orElseThrow(NotFoundException::new);
        session.revoke(Instant.now(), "USER_REVOKED");
    }

    public int revokeAll(UUID userId, UUID exceptSessionId, String reason) {
        return sessions.revokeAll(userId, exceptSessionId, Instant.now(), reason);
    }

    @Transactional(readOnly = true)
    public List<SessionInfo> active(UUID userId, UUID currentSessionId) {
        return sessions.findActive(userId, Instant.now()).stream()
                .map(s -> new SessionInfo(s.getId(), s.getCreatedAt(), s.getLastSeenAt(), s.getIpAddress(),
                        s.getUserAgent(), s.getId().equals(currentSessionId)))
                .toList();
    }

    @Scheduled(cron = "0 17 3 * * *")
    @SchedulerLock(name = "sessions.cleanup", lockAtMostFor = "PT10M")
    public void cleanup() {
        sessions.deleteExpired(Instant.now().minus(Duration.ofDays(30)));
    }

    private Duration idleTimeout(boolean rememberMe) {
        return rememberMe ? config.rememberMeIdleTimeout() : config.idleTimeout();
    }
}

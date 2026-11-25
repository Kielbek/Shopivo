package pl.shopivo.authentication.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "user_sessions")
public class UserSessionEntity extends BaseEntity {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;
    @Column(name = "token_hash", nullable = false)
    private String tokenHash;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;
    @Column(name = "idle_expires_at", nullable = false)
    private Instant idleExpiresAt;
    @Column(name = "absolute_expires_at", nullable = false, updatable = false)
    private Instant absoluteExpiresAt;
    @Column(name = "remember_me", nullable = false, updatable = false)
    private boolean rememberMe;
    @Column(name = "mfa_verified", nullable = false)
    private boolean mfaVerified;
    @Column(name = "revoked_at")
    private Instant revokedAt;
    @Column(name = "revoke_reason")
    private String revokeReason;
    @Column(name = "ip_address")
    private String ipAddress;
    @Column(name = "user_agent")
    private String userAgent;

    protected UserSessionEntity() {
    }

    UserSessionEntity(UUID userId, String tokenHash, Instant now, Duration idle, Duration absolute, boolean rememberMe,
            boolean mfaVerified, String ipAddress, String userAgent) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.createdAt = now;
        this.lastSeenAt = now;
        this.absoluteExpiresAt = now.plus(absolute);
        this.idleExpiresAt = min(now.plus(idle), absoluteExpiresAt);
        this.rememberMe = rememberMe;
        this.mfaVerified = mfaVerified;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
    }

    boolean isActive(Instant now) {
        return revokedAt == null && idleExpiresAt.isAfter(now) && absoluteExpiresAt.isAfter(now);
    }

    boolean touchIfDue(Instant now, Duration idle, Duration touchInterval) {
        if (lastSeenAt.plus(touchInterval).isAfter(now)) {
            return false;
        }
        lastSeenAt = now;
        idleExpiresAt = min(now.plus(idle), absoluteExpiresAt);
        return true;
    }

    void revoke(Instant now, String reason) {
        if (revokedAt == null) {
            revokedAt = now;
            revokeReason = reason;
        }
    }

    void elevate(String newTokenHash) {
        this.mfaVerified = true;
        this.tokenHash = newTokenHash;
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    UUID getUserId() {
        return userId;
    }

    boolean isRememberMe() {
        return rememberMe;
    }

    boolean isMfaVerified() {
        return mfaVerified;
    }

    Instant getAbsoluteExpiresAt() {
        return absoluteExpiresAt;
    }

    Instant getCreatedAt() {
        return createdAt;
    }

    Instant getLastSeenAt() {
        return lastSeenAt;
    }

    String getIpAddress() {
        return ipAddress;
    }

    String getUserAgent() {
        return userAgent;
    }
}

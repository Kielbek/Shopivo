package pl.shopivo.authentication.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "user_tokens")
class UserTokenEntity extends BaseEntity {

    enum Purpose { EMAIL_VERIFICATION, PASSWORD_RESET }

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Purpose purpose;
    @Column(name = "token_hash", nullable = false, updatable = false)
    private String tokenHash;
    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;
    @Column(name = "consumed_at")
    private Instant consumedAt;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected UserTokenEntity() {
    }

    UserTokenEntity(UUID userId, Purpose purpose, String tokenHash, Instant expiresAt) {
        this.userId = userId;
        this.purpose = purpose;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.createdAt = Instant.now();
    }

    boolean isUsable(Instant now) {
        return consumedAt == null && expiresAt.isAfter(now);
    }

    void consume(Instant now) {
        consumedAt = now;
    }

    UUID getUserId() {
        return userId;
    }

    Purpose getPurpose() {
        return purpose;
    }
}

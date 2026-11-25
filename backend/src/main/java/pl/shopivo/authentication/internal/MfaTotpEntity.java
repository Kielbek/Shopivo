package pl.shopivo.authentication.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_mfa_totp")
class MfaTotpEntity {

    @Id
    @Column(name = "user_id")
    private UUID userId;
    @Column(name = "secret_encrypted", nullable = false)
    private String secretEncrypted;
    @Column(name = "confirmed_at")
    private Instant confirmedAt;
    @Column(name = "last_used_step")
    private Long lastUsedStep;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected MfaTotpEntity() {
    }

    MfaTotpEntity(UUID userId, String secretEncrypted) {
        this.userId = userId;
        this.secretEncrypted = secretEncrypted;
        this.createdAt = Instant.now();
    }

    void replaceSecret(String secretEncrypted) {
        this.secretEncrypted = secretEncrypted;
        this.confirmedAt = null;
        this.lastUsedStep = null;
        this.createdAt = Instant.now();
    }

    boolean isConfirmed() {
        return confirmedAt != null;
    }

    void confirm(Instant now, long step) {
        this.confirmedAt = now;
        this.lastUsedStep = step;
    }

    void markUsed(long step) {
        this.lastUsedStep = step;
    }

    String getSecretEncrypted() {
        return secretEncrypted;
    }

    Long getLastUsedStep() {
        return lastUsedStep;
    }
}

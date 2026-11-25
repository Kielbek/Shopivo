package pl.shopivo.authentication.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "user_recovery_codes")
class RecoveryCodeEntity extends BaseEntity {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;
    @Column(name = "code_hash", nullable = false, updatable = false)
    private String codeHash;
    @Column(name = "used_at")
    private Instant usedAt;

    protected RecoveryCodeEntity() {
    }

    RecoveryCodeEntity(UUID userId, String codeHash) {
        this.userId = userId;
        this.codeHash = codeHash;
    }

    boolean isUnused() {
        return usedAt == null;
    }

    void use(Instant now) {
        usedAt = now;
    }
}

package pl.shopivo.authentication.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "user_oauth_identities")
class OAuthIdentityEntity extends BaseEntity {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;
    @Column(nullable = false, updatable = false)
    private String provider;
    @Column(nullable = false, updatable = false)
    private String subject;
    @Column(nullable = false, columnDefinition = "citext")
    private String email;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected OAuthIdentityEntity() {
    }

    OAuthIdentityEntity(UUID userId, String provider, String subject, String email) {
        this.userId = userId;
        this.provider = provider;
        this.subject = subject;
        this.email = email;
        this.createdAt = Instant.now();
    }

    UUID getUserId() {
        return userId;
    }
}

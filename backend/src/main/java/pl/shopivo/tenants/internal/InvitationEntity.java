package pl.shopivo.tenants.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.TenantId;
import pl.shopivo.shared.persistence.BaseEntity;
import pl.shopivo.tenants.InvitationView;
import pl.shopivo.tenants.StoreRole;

@Entity
@Table(name = "tenant_invitations")
public class InvitationEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(nullable = false, updatable = false, columnDefinition = "citext")
    private String email;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StoreRole role;
    @Column(name = "token_hash", nullable = false)
    private String tokenHash;
    @Column(name = "invited_by", nullable = false, updatable = false)
    private UUID invitedBy;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    @Column(name = "accepted_at")
    private Instant acceptedAt;
    @Column(name = "revoked_at")
    private Instant revokedAt;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected InvitationEntity() {
    }

    public InvitationEntity(String email, StoreRole role, String tokenHash, UUID invitedBy, Instant expiresAt) {
        this.email = email;
        this.role = role;
        this.tokenHash = tokenHash;
        this.invitedBy = invitedBy;
        this.expiresAt = expiresAt;
        this.createdAt = Instant.now();
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getEmail() {
        return email;
    }

    public StoreRole getRole() {
        return role;
    }

    public UUID getInvitedBy() {
        return invitedBy;
    }

    public boolean isPending(Instant now) {
        return acceptedAt == null && revokedAt == null && expiresAt.isAfter(now);
    }

    public void reissue(String tokenHash, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public void accept(Instant now) {
        this.acceptedAt = now;
    }

    public void revoke(Instant now) {
        this.revokedAt = now;
    }

    public InvitationView toView() {
        return new InvitationView(getId(), email, role, expiresAt, createdAt);
    }
}

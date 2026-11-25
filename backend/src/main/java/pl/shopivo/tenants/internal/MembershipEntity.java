package pl.shopivo.tenants.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import pl.shopivo.shared.persistence.BaseEntity;
import pl.shopivo.tenants.MembershipStatus;
import pl.shopivo.tenants.MembershipView;
import pl.shopivo.tenants.StoreRole;

/**
 * Not annotated with {@code @TenantId}: a user must be able to list memberships across all their tenants.
 * Isolation is enforced by the RLS policy (tenant OR own user) and explicit tenant filters in queries.
 */
@Entity
@Table(name = "tenant_memberships")
public class MembershipEntity extends BaseEntity {

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StoreRole role;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MembershipStatus status;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Version
    private long version;

    protected MembershipEntity() {
    }

    public MembershipEntity(UUID tenantId, UUID userId, StoreRole role) {
        this.tenantId = tenantId;
        this.userId = userId;
        this.role = role;
        this.status = MembershipStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getUserId() {
        return userId;
    }

    public StoreRole getRole() {
        return role;
    }

    public MembershipStatus getStatus() {
        return status;
    }

    public void changeRole(StoreRole role) {
        this.role = role;
    }

    public void changeStatus(MembershipStatus status) {
        this.status = status;
    }

    public MembershipView toView() {
        return new MembershipView(getId(), tenantId, userId, role, status, createdAt);
    }
}

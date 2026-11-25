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
import pl.shopivo.tenants.TenantStatus;
import pl.shopivo.tenants.TenantView;

@Entity
@Table(name = "tenants")
public class TenantEntity extends BaseEntity {

    @Column(nullable = false)
    private String name;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TenantStatus status;
    @Column(name = "suspended_reason")
    private String suspendedReason;
    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Version
    private long version;

    protected TenantEntity() {
    }

    public TenantEntity(UUID id, String name, UUID createdBy) {
        super(id);
        this.name = name;
        this.createdBy = createdBy;
        this.status = TenantStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public String getName() {
        return name;
    }

    public TenantStatus getStatus() {
        return status;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void suspend(String reason) {
        this.status = TenantStatus.SUSPENDED;
        this.suspendedReason = reason;
    }

    public void reactivate() {
        this.status = TenantStatus.ACTIVE;
        this.suspendedReason = null;
    }

    public TenantView toView() {
        return new TenantView(getId(), name, status, suspendedReason, createdBy, createdAt);
    }
}

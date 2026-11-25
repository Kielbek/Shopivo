package pl.shopivo.domains.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.TenantId;
import pl.shopivo.domains.DomainStatus;
import pl.shopivo.domains.DomainType;
import pl.shopivo.domains.StoreDomainView;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "store_domains")
public class StoreDomainEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(nullable = false, updatable = false)
    private String hostname;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private DomainType type;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DomainStatus status;
    @Column(name = "is_primary", nullable = false)
    private boolean primary;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Version
    private long version;

    protected StoreDomainEntity() {
    }

    public static StoreDomainEntity platformSubdomain(String hostname) {
        StoreDomainEntity e = new StoreDomainEntity();
        e.hostname = hostname;
        e.type = DomainType.PLATFORM_SUBDOMAIN;
        e.status = DomainStatus.ACTIVE;
        e.primary = true;
        e.createdAt = Instant.now();
        e.updatedAt = e.createdAt;
        return e;
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getHostname() {
        return hostname;
    }

    public StoreDomainView toView() {
        return new StoreDomainView(getId(), hostname, type, status, primary, createdAt);
    }
}

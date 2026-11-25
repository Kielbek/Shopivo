package pl.shopivo.catalog.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.TenantId;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "brands")
public class BrandEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private String slug;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected BrandEntity() {
    }

    public BrandEntity(String name, String slug) {
        this.name = name;
        this.slug = slug;
    }

    public void rename(String name, String slug) {
        this.name = name;
        this.slug = slug;
    }

    public String getName() { return name; }
    public String getSlug() { return slug; }
}

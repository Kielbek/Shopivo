package pl.shopivo.catalog.internal;

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
import pl.shopivo.catalog.ProductStatus;
import pl.shopivo.catalog.ProductType;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "products")
public class ProductEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private String slug;
    private String description;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductStatus status = ProductStatus.DRAFT;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductType type = ProductType.PHYSICAL;
    @Column(name = "brand_id")
    private UUID brandId;
    @Column(name = "vat_rate_bps", nullable = false)
    private int vatRateBps = 2300;
    @Column(name = "options_json", nullable = false)
    private String optionsJson = "[]";
    @Column(name = "seo_title")
    private String seoTitle;
    @Column(name = "seo_description")
    private String seoDescription;
    @Column(name = "published_at")
    private Instant publishedAt;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
    @Version
    private long version;

    protected ProductEntity() {
    }

    public ProductEntity(String name, String slug) {
        this.name = name;
        this.slug = slug;
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public void update(String name, String slug, String description, ProductType type, UUID brandId, int vatRateBps,
            String optionsJson, String seoTitle, String seoDescription) {
        this.name = name;
        this.slug = slug;
        this.description = description;
        this.type = type;
        this.brandId = brandId;
        this.vatRateBps = vatRateBps;
        this.optionsJson = optionsJson;
        this.seoTitle = seoTitle;
        this.seoDescription = seoDescription;
    }

    /**
     * Marks the aggregate as modified even if only its variants/categories changed, so the optimistic version is
     * bumped and concurrent edits of the same product are detected.
     */
    public void markEdited() {
        this.updatedAt = Instant.now();
    }

    public void changeStatus(ProductStatus status) {
        if (status == ProductStatus.ACTIVE && publishedAt == null) {
            publishedAt = Instant.now();
        }
        this.status = status;
    }

    public UUID getTenantId() { return tenantId; }
    public String getName() { return name; }
    public String getSlug() { return slug; }
    public String getDescription() { return description; }
    public ProductStatus getStatus() { return status; }
    public ProductType getType() { return type; }
    public UUID getBrandId() { return brandId; }
    public int getVatRateBps() { return vatRateBps; }
    public String getOptionsJson() { return optionsJson; }
    public String getSeoTitle() { return seoTitle; }
    public String getSeoDescription() { return seoDescription; }
    public Instant getPublishedAt() { return publishedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public long getVersion() { return version; }
}

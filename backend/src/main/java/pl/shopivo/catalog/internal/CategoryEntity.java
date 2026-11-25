package pl.shopivo.catalog.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.TenantId;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "categories")
public class CategoryEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(name = "parent_id")
    private UUID parentId;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private String slug;
    private String description;
    @Column(nullable = false)
    private int position;
    @Column(nullable = false)
    private String path;
    @Column(nullable = false)
    private int depth;
    @Column(nullable = false)
    private boolean visible = true;
    @Column(name = "seo_title")
    private String seoTitle;
    @Column(name = "seo_description")
    private String seoDescription;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
    @Version
    private long version;

    protected CategoryEntity() {
    }

    public CategoryEntity(String name, String slug) {
        this.name = name;
        this.slug = slug;
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public void update(String name, String slug, String description, boolean visible, String seoTitle, String seoDescription) {
        this.name = name;
        this.slug = slug;
        this.description = description;
        this.visible = visible;
        this.seoTitle = seoTitle;
        this.seoDescription = seoDescription;
    }

    /** Places the category under {@code parent} (null = root). */
    public void placeUnder(CategoryEntity parent, int position) {
        this.parentId = parent == null ? null : parent.getId();
        this.path = (parent == null ? "/" : parent.getPath()) + getId() + "/";
        this.depth = parent == null ? 0 : parent.getDepth() + 1;
        this.position = position;
    }

    /** After an ancestor moved: rewrites the path prefix. */
    public void rebase(String oldPrefix, String newPrefix, int depthDelta) {
        this.path = newPrefix + path.substring(oldPrefix.length());
        this.depth += depthDelta;
    }

    public void setPosition(int position) { this.position = position; }
    public UUID getTenantId() { return tenantId; }
    public UUID getParentId() { return parentId; }
    public String getName() { return name; }
    public String getSlug() { return slug; }
    public String getDescription() { return description; }
    public int getPosition() { return position; }
    public String getPath() { return path; }
    public int getDepth() { return depth; }
    public boolean isVisible() { return visible; }
    public String getSeoTitle() { return seoTitle; }
    public String getSeoDescription() { return seoDescription; }
    public long getVersion() { return version; }
}

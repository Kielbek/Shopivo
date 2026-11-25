package pl.shopivo.stores.internal;

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
import pl.shopivo.shared.persistence.BaseEntity;
import pl.shopivo.stores.StoreStatus;
import pl.shopivo.stores.StoreView;

@Entity
@Table(name = "stores")
public class StoreEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false, updatable = false)
    private String slug;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StoreStatus status;
    @Column(name = "default_locale", nullable = false)
    private String defaultLocale;
    @Column(name = "default_currency", nullable = false)
    private String defaultCurrency;
    @Column(nullable = false)
    private String timezone;
    @Column(name = "contact_email", columnDefinition = "citext")
    private String contactEmail;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Version
    private long version;

    protected StoreEntity() {
    }

    public StoreEntity(String name, String slug, String contactEmail) {
        this.name = name;
        this.slug = slug;
        this.contactEmail = contactEmail;
        this.status = StoreStatus.DRAFT;
        this.defaultLocale = "pl-PL";
        this.defaultCurrency = "PLN";
        this.timezone = "Europe/Warsaw";
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

    public String getSlug() {
        return slug;
    }

    public String getName() {
        return name;
    }

    public StoreStatus getStatus() {
        return status;
    }

    public long getVersion() {
        return version;
    }

    public void update(String name, String contactEmail, String locale, String currency, String timezone) {
        this.name = name;
        this.contactEmail = contactEmail;
        this.defaultLocale = locale;
        this.defaultCurrency = currency;
        this.timezone = timezone;
    }

    public StoreView toView(String primaryHostname) {
        return new StoreView(getId(), tenantId, name, slug, status, defaultLocale, defaultCurrency, timezone,
                contactEmail, primaryHostname, createdAt, version);
    }
}

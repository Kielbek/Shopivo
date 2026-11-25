package pl.shopivo.stores.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.TenantId;
import pl.shopivo.shared.persistence.BaseEntity;
import pl.shopivo.stores.StoreSettingsView;

@Entity
@Table(name = "store_settings")
public class StoreSettingsEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(name = "legal_company_name")
    private String legalCompanyName;
    @Column(name = "tax_id")
    private String taxId;
    @Column(name = "address_line1")
    private String addressLine1;
    @Column(name = "address_line2")
    private String addressLine2;
    @Column(name = "postal_code")
    private String postalCode;
    private String city;
    @Column(name = "country_code", nullable = false)
    private String countryCode = "PL";
    private String phone;
    @Column(name = "order_email", columnDefinition = "citext")
    private String orderEmail;
    @Column(name = "prices_include_tax", nullable = false)
    private boolean pricesIncludeTax = true;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
    @Version
    private long version;

    public StoreSettingsEntity() {
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public long getVersion() {
        return version;
    }

    public void update(StoreSettingsView v) {
        this.legalCompanyName = v.legalCompanyName();
        this.taxId = v.taxId();
        this.addressLine1 = v.addressLine1();
        this.addressLine2 = v.addressLine2();
        this.postalCode = v.postalCode();
        this.city = v.city();
        this.countryCode = v.countryCode();
        this.phone = v.phone();
        this.orderEmail = v.orderEmail();
        this.pricesIncludeTax = v.pricesIncludeTax();
    }

    public StoreSettingsView toView() {
        return new StoreSettingsView(legalCompanyName, taxId, addressLine1, addressLine2, postalCode, city, countryCode,
                phone, orderEmail, pricesIncludeTax, version);
    }
}

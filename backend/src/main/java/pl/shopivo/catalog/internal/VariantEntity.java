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
@Table(name = "product_variants")
public class VariantEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;
    @Column(name = "option_values_json", nullable = false)
    private String optionValuesJson = "{}";
    private String sku;
    private String ean;
    @Column(name = "price_minor", nullable = false)
    private long priceMinor;
    @Column(name = "compare_at_minor")
    private Long compareAtMinor;
    @Column(name = "cost_minor")
    private Long costMinor;
    @Column(nullable = false, updatable = false)
    private String currency;
    @Column(name = "weight_grams")
    private Integer weightGrams;
    @Column(name = "length_mm")
    private Integer lengthMm;
    @Column(name = "width_mm")
    private Integer widthMm;
    @Column(name = "height_mm")
    private Integer heightMm;
    @Column(name = "track_inventory", nullable = false)
    private boolean trackInventory = true;
    @Column(name = "allow_backorder", nullable = false)
    private boolean allowBackorder;
    @Column(nullable = false)
    private int position;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
    @Version
    private long version;

    protected VariantEntity() {
    }

    public VariantEntity(UUID productId, String currency) {
        this.productId = productId;
        this.currency = currency;
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public void update(String optionValuesJson, String sku, String ean, long priceMinor, Long compareAtMinor, Long costMinor,
            Integer weightGrams, Integer lengthMm, Integer widthMm, Integer heightMm, boolean trackInventory,
            boolean allowBackorder, int position) {
        this.optionValuesJson = optionValuesJson;
        this.sku = sku;
        this.ean = ean;
        this.priceMinor = priceMinor;
        this.compareAtMinor = compareAtMinor;
        this.costMinor = costMinor;
        this.weightGrams = weightGrams;
        this.lengthMm = lengthMm;
        this.widthMm = widthMm;
        this.heightMm = heightMm;
        this.trackInventory = trackInventory;
        this.allowBackorder = allowBackorder;
        this.position = position;
    }

    public UUID getProductId() { return productId; }
    public String getOptionValuesJson() { return optionValuesJson; }
    public String getSku() { return sku; }
    public String getEan() { return ean; }
    public long getPriceMinor() { return priceMinor; }
    public Long getCompareAtMinor() { return compareAtMinor; }
    public Long getCostMinor() { return costMinor; }
    public String getCurrency() { return currency; }
    public Integer getWeightGrams() { return weightGrams; }
    public Integer getLengthMm() { return lengthMm; }
    public Integer getWidthMm() { return widthMm; }
    public Integer getHeightMm() { return heightMm; }
    public boolean isTrackInventory() { return trackInventory; }
    public boolean isAllowBackorder() { return allowBackorder; }
    public int getPosition() { return position; }
}

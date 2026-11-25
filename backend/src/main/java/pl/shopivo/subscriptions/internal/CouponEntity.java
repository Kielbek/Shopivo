package pl.shopivo.subscriptions.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "billing_coupons")
public class CouponEntity extends BaseEntity {

    public enum Duration { ONCE, REPEATING, FOREVER }

    @Column(nullable = false, updatable = false)
    private String code;
    private String description;
    @Column(name = "percent_off")
    private Integer percentOff;
    @Column(name = "amount_off_minor")
    private Long amountOffMinor;
    private String currency;
    @Column(nullable = false)
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    private Duration duration;
    @Column(name = "duration_months")
    private Integer durationMonths;
    @Column(name = "max_redemptions")
    private Integer maxRedemptions;
    @Column(name = "redeemed_count", nullable = false)
    private int redeemedCount;
    @Column(name = "valid_until")
    private Instant validUntil;
    @Column(nullable = false)
    private boolean active = true;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
    @Version
    private long version;

    protected CouponEntity() {
    }

    public CouponEntity(String code, String description, Integer percentOff, Long amountOffMinor, String currency,
            Duration duration, Integer durationMonths, Integer maxRedemptions, Instant validUntil) {
        this.code = code;
        this.description = description;
        this.percentOff = percentOff;
        this.amountOffMinor = amountOffMinor;
        this.currency = currency;
        this.duration = duration;
        this.durationMonths = durationMonths;
        this.maxRedemptions = maxRedemptions;
        this.validUntil = validUntil;
    }

    public boolean isRedeemable(Instant now) {
        return active && (validUntil == null || validUntil.isAfter(now))
                && (maxRedemptions == null || redeemedCount < maxRedemptions);
    }

    /** Discount for one charge (never more than the amount). */
    public long discountFor(long amountMinor, String chargeCurrency) {
        if (percentOff != null) return Math.min(amountMinor, Math.round(amountMinor * percentOff / 100.0));
        if (amountOffMinor != null && chargeCurrency.equals(currency)) return Math.min(amountMinor, amountOffMinor);
        return 0;
    }

    /** Whether the coupon still applies, given charges already discounted and the billing interval length. */
    public boolean appliesAfter(int chargesUsed, int intervalMonths) {
        return switch (duration) {
            case ONCE -> chargesUsed == 0;
            case FOREVER -> true;
            case REPEATING -> chargesUsed * intervalMonths < (durationMonths == null ? 0 : durationMonths);
        };
    }

    public void redeem() { redeemedCount++; }
    public void setActive(boolean active) { this.active = active; }
    public String getCode() { return code; }
    public String getDescription() { return description; }
    public Integer getPercentOff() { return percentOff; }
    public Long getAmountOffMinor() { return amountOffMinor; }
    public String getCurrency() { return currency; }
    public Duration getDuration() { return duration; }
    public Integer getDurationMonths() { return durationMonths; }
    public Integer getMaxRedemptions() { return maxRedemptions; }
    public int getRedeemedCount() { return redeemedCount; }
    public Instant getValidUntil() { return validUntil; }
    public boolean isActive() { return active; }
}

package pl.shopivo.subscriptions.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import pl.shopivo.shared.persistence.BaseEntity;
import pl.shopivo.subscriptions.BillingInterval;

/** Immutable price point. Changing a price creates a new row; existing subscribers keep their price (grandfathering). */
@Entity
@Table(name = "plan_prices")
public class PriceEntity extends BaseEntity {

    @Column(name = "plan_id", nullable = false, updatable = false)
    private UUID planId;
    @Enumerated(EnumType.STRING)
    @Column(name = "billing_interval", nullable = false, updatable = false)
    private BillingInterval interval;
    @Column(nullable = false, updatable = false)
    private String currency;
    @Column(name = "amount_minor", nullable = false, updatable = false)
    private long amountMinor;
    @Column(nullable = false)
    private boolean active = true;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected PriceEntity() {
    }

    public PriceEntity(UUID planId, BillingInterval interval, String currency, long amountMinor) {
        this.planId = planId;
        this.interval = interval;
        this.currency = currency;
        this.amountMinor = amountMinor;
    }

    public void retire() { this.active = false; }
    public UUID getPlanId() { return planId; }
    public BillingInterval getInterval() { return interval; }
    public String getCurrency() { return currency; }
    public long getAmountMinor() { return amountMinor; }
    public boolean isActive() { return active; }

    /** Monthly equivalent, used for MRR and plan comparison. */
    public long monthlyAmount() {
        return Math.round((double) amountMinor / interval.months());
    }
}

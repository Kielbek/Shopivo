package pl.shopivo.subscriptions.internal;

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
import pl.shopivo.subscriptions.BillingInterval;
import pl.shopivo.subscriptions.SubscriptionStatus;

@Entity
@Table(name = "subscriptions")
public class SubscriptionEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(name = "plan_id", nullable = false)
    private UUID planId;
    @Column(name = "price_id")
    private UUID priceId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SubscriptionStatus status;
    @Enumerated(EnumType.STRING)
    @Column(name = "billing_interval")
    private BillingInterval interval;
    @Column(name = "trial_ends_at")
    private Instant trialEndsAt;
    @Column(name = "current_period_start")
    private Instant currentPeriodStart;
    @Column(name = "current_period_end")
    private Instant currentPeriodEnd;
    @Column(name = "cancel_at_period_end", nullable = false)
    private boolean cancelAtPeriodEnd;
    @Column(name = "canceled_at")
    private Instant canceledAt;
    @Column(name = "grace_until")
    private Instant graceUntil;
    @Column(name = "pending_plan_id")
    private UUID pendingPlanId;
    @Column(name = "pending_price_id")
    private UUID pendingPriceId;
    @Column(name = "coupon_id")
    private UUID couponId;
    @Column(name = "coupon_charges_used", nullable = false)
    private int couponChargesUsed;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
    @Version
    private long version;

    protected SubscriptionEntity() {
    }

    public static SubscriptionEntity trial(UUID planId, Instant trialEndsAt) {
        SubscriptionEntity s = new SubscriptionEntity();
        s.planId = planId;
        s.status = SubscriptionStatus.TRIALING;
        s.trialEndsAt = trialEndsAt;
        return s;
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    /** Payment received: start/extend a paid period on the given plan/price. */
    public void activate(UUID planId, UUID priceId, BillingInterval interval, Instant periodStart, Instant periodEnd) {
        this.planId = planId;
        this.priceId = priceId;
        this.interval = interval;
        this.currentPeriodStart = periodStart;
        this.currentPeriodEnd = periodEnd;
        this.status = SubscriptionStatus.ACTIVE;
        this.graceUntil = null;
        this.pendingPlanId = null;
        this.pendingPriceId = null;
        this.cancelAtPeriodEnd = false;
        this.canceledAt = null;
    }

    public void changePlanNow(UUID planId, UUID priceId) {
        this.planId = planId;
        this.priceId = priceId;
    }

    public void scheduleChange(UUID planId, UUID priceId) {
        this.pendingPlanId = planId;
        this.pendingPriceId = priceId;
    }

    public void clearPendingChange() {
        this.pendingPlanId = null;
        this.pendingPriceId = null;
    }

    public void markPastDue(Instant graceUntil) {
        this.status = SubscriptionStatus.PAST_DUE;
        this.graceUntil = graceUntil;
    }

    public void expire() {
        this.status = SubscriptionStatus.EXPIRED;
    }

    public void cancelNow(Instant now) {
        this.status = SubscriptionStatus.CANCELED;
        this.canceledAt = now;
    }

    public void setCancelAtPeriodEnd(boolean cancel, Instant now) {
        this.cancelAtPeriodEnd = cancel;
        this.canceledAt = cancel ? now : null;
    }

    public void applyCoupon(UUID couponId) {
        this.couponId = couponId;
        this.couponChargesUsed = 0;
    }

    public void couponUsed() {
        this.couponChargesUsed++;
    }

    public void extendTrial(Instant until) {
        this.trialEndsAt = until;
        if (status == SubscriptionStatus.EXPIRED && currentPeriodEnd == null) {
            status = SubscriptionStatus.TRIALING;
        }
    }

    public UUID getTenantId() { return tenantId; }
    public UUID getPlanId() { return planId; }
    public UUID getPriceId() { return priceId; }
    public SubscriptionStatus getStatus() { return status; }
    public BillingInterval getInterval() { return interval; }
    public Instant getTrialEndsAt() { return trialEndsAt; }
    public Instant getCurrentPeriodStart() { return currentPeriodStart; }
    public Instant getCurrentPeriodEnd() { return currentPeriodEnd; }
    public boolean isCancelAtPeriodEnd() { return cancelAtPeriodEnd; }
    public Instant getGraceUntil() { return graceUntil; }
    public UUID getPendingPlanId() { return pendingPlanId; }
    public UUID getPendingPriceId() { return pendingPriceId; }
    public UUID getCouponId() { return couponId; }
    public int getCouponChargesUsed() { return couponChargesUsed; }
}

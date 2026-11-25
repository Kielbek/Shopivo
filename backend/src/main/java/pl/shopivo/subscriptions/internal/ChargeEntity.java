package pl.shopivo.subscriptions.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.TenantId;
import pl.shopivo.shared.persistence.BaseEntity;
import pl.shopivo.subscriptions.BillingInterval;

@Entity
@Table(name = "subscription_charges")
public class ChargeEntity extends BaseEntity {

    public enum Kind { INITIAL, RENEWAL, UPGRADE }

    public enum Status { OPEN, PAID, FAILED, VOID }

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(name = "subscription_id", nullable = false, updatable = false)
    private UUID subscriptionId;
    @Column(nullable = false, updatable = false)
    private String number;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Kind kind;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.OPEN;
    @Column(name = "plan_id", nullable = false, updatable = false)
    private UUID planId;
    @Column(name = "price_id", nullable = false, updatable = false)
    private UUID priceId;
    @Enumerated(EnumType.STRING)
    @Column(name = "billing_interval", nullable = false, updatable = false)
    private BillingInterval interval;
    @Column(name = "period_start", nullable = false)
    private Instant periodStart;
    @Column(name = "period_end", nullable = false)
    private Instant periodEnd;
    @Column(name = "list_amount_minor", nullable = false, updatable = false)
    private long listAmountMinor;
    @Column(name = "discount_minor", nullable = false, updatable = false)
    private long discountMinor;
    @Column(name = "amount_minor", nullable = false, updatable = false)
    private long amountMinor;
    @Column(name = "tax_rate_bps", nullable = false, updatable = false)
    private int taxRateBps;
    @Column(name = "tax_minor", nullable = false, updatable = false)
    private long taxMinor;
    @Column(name = "total_minor", nullable = false, updatable = false)
    private long totalMinor;
    @Column(nullable = false, updatable = false)
    private String currency;
    @Column(updatable = false)
    private String description;
    @Column(name = "coupon_id", updatable = false)
    private UUID couponId;
    private String provider;
    @Column(name = "provider_payment_id")
    private String providerPaymentId;
    @Column(name = "payment_url")
    private String paymentUrl;
    @Column(name = "reminders_sent", nullable = false)
    private int remindersSent;
    @Column(name = "last_reminder_at")
    private Instant lastReminderAt;
    @Column(name = "due_at", nullable = false)
    private Instant dueAt;
    @Column(name = "issued_at", nullable = false, updatable = false)
    private Instant issuedAt = Instant.now();
    @Column(name = "paid_at")
    private Instant paidAt;
    @Version
    private long version;

    protected ChargeEntity() {
    }

    public ChargeEntity(UUID subscriptionId, String number, Kind kind, UUID planId, UUID priceId, BillingInterval interval,
            Instant periodStart, Instant periodEnd, long listAmountMinor, long discountMinor, int taxRateBps,
            String currency, String description, UUID couponId, Instant dueAt) {
        this.subscriptionId = subscriptionId;
        this.number = number;
        this.kind = kind;
        this.planId = planId;
        this.priceId = priceId;
        this.interval = interval;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
        this.listAmountMinor = listAmountMinor;
        this.discountMinor = discountMinor;
        this.amountMinor = listAmountMinor - discountMinor;
        this.taxRateBps = taxRateBps;
        // VAT rounded half-up on the net amount (art. 106e ust. 11 ustawy o VAT — rounding to full grosze).
        this.taxMinor = Math.round(amountMinor * taxRateBps / 10_000.0);
        this.totalMinor = amountMinor + taxMinor;
        this.currency = currency;
        this.description = description;
        this.couponId = couponId;
        this.dueAt = dueAt;
    }

    public void attachPayment(String provider, String providerPaymentId, String url) {
        this.provider = provider;
        this.providerPaymentId = providerPaymentId;
        this.paymentUrl = url;
        if (status == Status.FAILED) status = Status.OPEN;
    }

    public void markPaid(Instant at, String providerPaymentId) {
        this.status = Status.PAID;
        this.paidAt = at;
        if (providerPaymentId != null) this.providerPaymentId = providerPaymentId;
    }

    public void markFailed() {
        if (status == Status.OPEN) status = Status.FAILED;
    }

    public void voidCharge() {
        if (status == Status.OPEN || status == Status.FAILED) status = Status.VOID;
    }

    /** A paid initial/upgrade charge whose planned start already passed starts its period at payment time. */
    public void startPeriodAt(Instant start) {
        this.periodStart = start;
        this.periodEnd = interval.addTo(start);
    }

    public void reminded(Instant at) {
        remindersSent++;
        lastReminderAt = at;
    }

    public UUID getTenantId() { return tenantId; }
    public UUID getSubscriptionId() { return subscriptionId; }
    public String getNumber() { return number; }
    public Kind getKind() { return kind; }
    public Status getStatus() { return status; }
    public UUID getPlanId() { return planId; }
    public UUID getPriceId() { return priceId; }
    public BillingInterval getInterval() { return interval; }
    public Instant getPeriodStart() { return periodStart; }
    public Instant getPeriodEnd() { return periodEnd; }
    public long getListAmountMinor() { return listAmountMinor; }
    public long getDiscountMinor() { return discountMinor; }
    public long getAmountMinor() { return amountMinor; }
    public int getTaxRateBps() { return taxRateBps; }
    public long getTaxMinor() { return taxMinor; }
    public long getTotalMinor() { return totalMinor; }
    public String getCurrency() { return currency; }
    public String getDescription() { return description; }
    public String getProviderPaymentId() { return providerPaymentId; }
    public UUID getCouponId() { return couponId; }
    public String getProvider() { return provider; }
    public String getPaymentUrl() { return paymentUrl; }
    public int getRemindersSent() { return remindersSent; }
    public Instant getLastReminderAt() { return lastReminderAt; }
    public Instant getDueAt() { return dueAt; }
    public Instant getIssuedAt() { return issuedAt; }
    public Instant getPaidAt() { return paidAt; }
}

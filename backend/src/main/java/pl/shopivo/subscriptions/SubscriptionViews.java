package pl.shopivo.subscriptions;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Read models of the subscriptions module (returned by the API). Amounts in minor units (grosze). */
public final class SubscriptionViews {

    private SubscriptionViews() {
    }

    public record PriceView(UUID id, BillingInterval interval, String currency, long amountMinor, long monthlyAmountMinor) {
    }

    public record PlanView(UUID id, String code, String name, String description, int sortOrder, boolean active,
            boolean publicPlan, int trialDays, List<PriceView> prices, Map<String, String> entitlements, long version) {
    }

    public record PlanSummary(UUID id, String code, String name) {
    }

    public record EntitlementView(String key, String label, EntitlementKey.Kind kind, String value, boolean overridden) {
    }

    public record UsageView(String metric, String label, long value, long limit, boolean fairUse) {
    }

    public record CouponSummary(String code, String description, Integer percentOff, Long amountOffMinor,
            String duration, Integer durationMonths) {
    }

    public record ChargeView(UUID id, String number, String kind, String status, PlanSummary plan,
            BillingInterval interval, Instant periodStart, Instant periodEnd, long listAmountMinor, long discountMinor,
            long amountMinor, int taxRateBps, long taxMinor, long totalMinor, String currency, String description,
            String provider, Instant dueAt, Instant issuedAt, Instant paidAt) {
    }

    public record SubscriptionView(UUID id, SubscriptionStatus status, String access, PlanSummary plan,
            PriceView price, BillingInterval interval, Instant trialEndsAt, Instant currentPeriodStart,
            Instant currentPeriodEnd, boolean cancelAtPeriodEnd, Instant graceUntil, PlanSummary pendingPlan,
            BillingInterval pendingInterval, CouponSummary coupon, List<ChargeView> unpaidCharges,
            List<EntitlementView> entitlements, List<UsageView> usage, boolean paymentsAvailable, int vatRateBps) {
    }

    public record HistoryView(String type, String fromStatus, String toStatus, String planCode, String detail,
            Instant createdAt) {
    }

    public record PaymentStart(ChargeView charge, String paymentUrl) {
    }

    public record CouponView(UUID id, String code, String description, Integer percentOff, Long amountOffMinor,
            String currency, String duration, Integer durationMonths, Integer maxRedemptions, int redeemedCount,
            Instant validUntil, boolean active) {
    }
}

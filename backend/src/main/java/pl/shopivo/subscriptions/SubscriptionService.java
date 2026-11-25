package pl.shopivo.subscriptions;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.billing.BillingPayments;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.security.CurrentUser;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.web.ClientInfo;
import pl.shopivo.subscriptions.SubscriptionViews.ChargeView;
import pl.shopivo.subscriptions.SubscriptionViews.CouponSummary;
import pl.shopivo.subscriptions.SubscriptionViews.EntitlementView;
import pl.shopivo.subscriptions.SubscriptionViews.HistoryView;
import pl.shopivo.subscriptions.SubscriptionViews.PaymentStart;
import pl.shopivo.subscriptions.SubscriptionViews.PlanSummary;
import pl.shopivo.subscriptions.SubscriptionViews.SubscriptionView;
import pl.shopivo.subscriptions.SubscriptionViews.UsageView;
import pl.shopivo.subscriptions.internal.BillingStateCache;
import pl.shopivo.subscriptions.internal.ChargeEntity;
import pl.shopivo.subscriptions.internal.CouponRepository;
import pl.shopivo.subscriptions.internal.PlanEntity;
import pl.shopivo.subscriptions.internal.PlanRepository;
import pl.shopivo.subscriptions.internal.PriceRepository;
import pl.shopivo.subscriptions.internal.SubscriptionEngine;
import pl.shopivo.subscriptions.internal.SubscriptionEntity;
import pl.shopivo.subscriptions.internal.SubscriptionEventRepository;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserView;

/**
 * Merchant-facing subscription operations for the tenant bound to the current request. Not transactional itself:
 * state changes run in short transactions and the operator's payment link is requested between them.
 */
@Service
public class SubscriptionService {

    static final ZoneId BILLING_ZONE = ZoneId.of("Europe/Warsaw");

    private final SubscriptionEngine engine;
    private final BillingPayments payments;
    private final PlanRepository plans;
    private final PriceRepository prices;
    private final CouponRepository coupons;
    private final SubscriptionEventRepository events;
    private final BillingStateCache cache;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AuditLog auditLog;
    private final ShopivoProperties properties;
    private final BillingProperties billing;
    private final UserAccounts users;

    SubscriptionService(SubscriptionEngine engine, BillingPayments payments, PlanRepository plans, PriceRepository prices,
            CouponRepository coupons, SubscriptionEventRepository events, BillingStateCache cache, JdbcTemplate jdbc,
            TransactionTemplate tx, AuditLog auditLog, ShopivoProperties properties, BillingProperties billing,
            UserAccounts users) {
        this.users = users;
        this.engine = engine;
        this.payments = payments;
        this.plans = plans;
        this.prices = prices;
        this.coupons = coupons;
        this.events = events;
        this.cache = cache;
        this.jdbc = jdbc;
        this.tx = tx;
        this.auditLog = auditLog;
        this.properties = properties;
        this.billing = billing;
    }

    public record ChangeResult(boolean scheduled, PaymentStart payment) {
    }

    public SubscriptionView details() {
        return tx.execute(st -> view(engine.current()));
    }

    public PaymentStart checkout(String planCode, BillingInterval interval, String couponCode) {
        ChargeEntity charge = tx.execute(st -> engine.prepareCheckout(planCode, interval, couponCode));
        audit("subscription.checkout", charge);
        return startPayment(charge);
    }

    public ChangeResult change(String planCode, BillingInterval interval) {
        Optional<ChargeEntity> charge = tx.execute(st -> engine.prepareChange(planCode, interval));
        if (charge.isEmpty()) {
            auditLog.record(AuditEntry.tenant("subscription.change.scheduled", TenantContext.requireTenantId(), "plan", planCode));
            return new ChangeResult(true, null);
        }
        audit("subscription.upgrade", charge.get());
        return new ChangeResult(false, startPayment(charge.get()));
    }

    public void cancel() {
        tx.executeWithoutResult(st -> {
            engine.cancel();
            auditLog.record(AuditEntry.tenant("subscription.cancel", TenantContext.requireTenantId(), "subscription", null));
        });
    }

    public void resume() {
        tx.executeWithoutResult(st -> {
            engine.resume();
            auditLog.record(AuditEntry.tenant("subscription.resume", TenantContext.requireTenantId(), "subscription", null));
        });
    }

    /** New payment link for an unpaid charge (links expire at the operator, so one is created per attempt). */
    public PaymentStart pay(UUID chargeId) {
        return startPayment(engine.unpaidCharge(chargeId));
    }

    public List<ChargeView> charges() {
        return tx.execute(st -> engine.charges().stream().map(this::chargeView).toList());
    }

    public List<HistoryView> history() {
        return tx.execute(st -> events.findTop50ByOrderByCreatedAtDesc().stream()
                .map(e -> new HistoryView(e.getType(), e.getFromStatus(), e.getToStatus(), e.getPlanCode(), e.getDetail(), e.getCreatedAt()))
                .toList());
    }

    // ----------------------------------------------------------------------------------------------- internals

    private PaymentStart startPayment(ChargeEntity charge) {
        if (charge.getStatus() == ChargeEntity.Status.PAID || charge.getTotalMinor() == 0) {
            return new PaymentStart(chargeView(charge), null);
        }
        CurrentUser current = SecurityUtils.requireUser();
        UserView user = users.getById(current.id());
        UUID tenantId = TenantContext.requireTenantId();
        // Unique per attempt (operators reject a reused session id); the charge id is recovered from the prefix.
        String externalId = charge.getId() + "_" + Long.toString(System.currentTimeMillis(), 36);
        String returnUrl = properties.appUrl() + "/sklep/" + tenantId + "/subskrypcja?platnosc=" + charge.getId();
        BillingPayments.CreatedPayment created = payments.create(new BillingPayments.PaymentSpec(externalId,
                charge.getTotalMinor(), charge.getCurrency(), charge.getDescription() + " — " + charge.getNumber(),
                user.email(), (user.firstName() + " " + user.lastName()).trim(), ClientInfo.current().ipAddress(), returnUrl));
        tx.executeWithoutResult(st -> engine.attachPayment(charge.getId(), created.provider(), created.providerPaymentId(), created.url()));
        return new PaymentStart(chargeView(charge), created.url());
    }

    private void audit(String action, ChargeEntity charge) {
        auditLog.record(AuditEntry.tenant(action, TenantContext.requireTenantId(), "charge", charge.getId())
                .with(Map.of("number", charge.getNumber(), "totalMinor", charge.getTotalMinor())));
    }

    private SubscriptionView view(SubscriptionEntity s) {
        UUID tenantId = s.getTenantId();
        var state = cache.get(tenantId);
        PlanSummary plan = plans.findById(s.getPlanId()).map(SubscriptionService::summary).orElse(null);
        PlanSummary pending = s.getPendingPlanId() == null ? null : plans.findById(s.getPendingPlanId()).map(SubscriptionService::summary).orElse(null);
        BillingInterval pendingInterval = s.getPendingPriceId() == null ? null
                : prices.findById(s.getPendingPriceId()).map(p -> p.getInterval()).orElse(null);
        CouponSummary coupon = s.getCouponId() == null ? null : coupons.findById(s.getCouponId())
                .map(c -> new CouponSummary(c.getCode(), c.getDescription(), c.getPercentOff(), c.getAmountOffMinor(),
                        c.getDuration().name(), c.getDurationMonths()))
                .orElse(null);
        List<ChargeView> unpaid = engine.charges().stream()
                .filter(c -> c.getStatus() == ChargeEntity.Status.OPEN || c.getStatus() == ChargeEntity.Status.FAILED)
                .map(this::chargeView).toList();
        List<EntitlementView> entitlements = new ArrayList<>();
        for (EntitlementKey key : EntitlementKey.values()) {
            state.value(key.key()).ifPresent(v -> entitlements.add(
                    new EntitlementView(key.key(), key.label(), key.kind(), v, state.overrides().containsKey(key.key()))));
        }
        return new SubscriptionView(s.getId(), s.getStatus(), state.fullAccess(Instant.now()) ? "FULL" : "READ_ONLY", plan,
                s.getPriceId() == null ? null : prices.findById(s.getPriceId()).map(PlanCatalog::price).orElse(null),
                s.getInterval(), s.getTrialEndsAt(), s.getCurrentPeriodStart(), s.getCurrentPeriodEnd(),
                s.isCancelAtPeriodEnd(), s.getGraceUntil(), pending, pendingInterval, coupon, unpaid, entitlements,
                usage(tenantId, state), payments.activeProvider().isPresent(), billing.vatRateBps());
    }

    private List<UsageView> usage(UUID tenantId, BillingStateCache.TenantBillingState state) {
        LocalDate period = LocalDate.now(BILLING_ZONE).withDayOfMonth(1);
        Map<String, Long> values = new HashMap<>();
        jdbc.query("select metric, value from tenant_usage where tenant_id = ? and period = ?",
                rs -> {
                    values.put(rs.getString(1), rs.getLong(2));
                }, tenantId, period);
        List<UsageView> result = new ArrayList<>();
        for (EntitlementKey key : EntitlementKey.values()) {
            if (key.usageMetric() == null) continue;
            long limit = state.value(key.key()).map(Entitlements::parse).orElse(0L);
            result.add(new UsageView(key.usageMetric(), key.label(), values.getOrDefault(key.usageMetric(), 0L), limit,
                    key.kind() == EntitlementKey.Kind.FAIR_USE));
        }
        return result;
    }

    ChargeView chargeView(ChargeEntity c) {
        return SubscriptionService.chargeView(c, plans.findById(c.getPlanId()).map(SubscriptionService::summary).orElse(null));
    }

    static ChargeView chargeView(ChargeEntity c, PlanSummary plan) {
        return new ChargeView(c.getId(), c.getNumber(), c.getKind().name(), c.getStatus().name(), plan, c.getInterval(),
                c.getPeriodStart(), c.getPeriodEnd(), c.getListAmountMinor(), c.getDiscountMinor(), c.getAmountMinor(),
                c.getTaxRateBps(), c.getTaxMinor(), c.getTotalMinor(), c.getCurrency(), c.getDescription(), c.getProvider(),
                c.getDueAt(), c.getIssuedAt(), c.getPaidAt());
    }

    static PlanSummary summary(PlanEntity p) {
        return new PlanSummary(p.getId(), p.getCode(), p.getName());
    }
}

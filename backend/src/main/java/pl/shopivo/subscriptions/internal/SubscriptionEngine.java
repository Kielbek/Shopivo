package pl.shopivo.subscriptions.internal;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.subscriptions.BillingInterval;
import pl.shopivo.subscriptions.BillingProperties;
import pl.shopivo.subscriptions.SubscriptionStatus;
import pl.shopivo.subscriptions.internal.ChargeEntity.Kind;
import pl.shopivo.subscriptions.internal.SubscriptionNotice.Type;

/**
 * State machine of a tenant's subscription. Every method runs in the tenant's context (bound by the caller) and in
 * its own transaction; payment links are created by the caller between transactions, never while holding locks.
 *
 * <pre>
 * TRIALING ──pay──▶ ACTIVE ──period end, renewal paid──▶ ACTIVE
 *    │                 │ └─period end, unpaid──▶ PAST_DUE ──pay──▶ ACTIVE
 *    │                 └─period end, canceled──▶ CANCELED   └─grace over──▶ EXPIRED
 *    └─trial over, unpaid──▶ EXPIRED ──pay (new checkout)──▶ ACTIVE
 * </pre>
 */
@Component
public class SubscriptionEngine {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionEngine.class);

    private final SubscriptionRepository subscriptions;
    private final ChargeRepository charges;
    private final PlanRepository plans;
    private final PriceRepository prices;
    private final CouponRepository coupons;
    private final SubscriptionEventRepository events;
    private final JdbcTemplate jdbc;
    private final BillingStateCache cache;
    private final ApplicationEventPublisher publisher;
    private final BillingProperties properties;

    SubscriptionEngine(SubscriptionRepository subscriptions, ChargeRepository charges, PlanRepository plans,
            PriceRepository prices, CouponRepository coupons, SubscriptionEventRepository events, JdbcTemplate jdbc,
            BillingStateCache cache, ApplicationEventPublisher publisher, BillingProperties properties) {
        this.subscriptions = subscriptions;
        this.charges = charges;
        this.plans = plans;
        this.prices = prices;
        this.coupons = coupons;
        this.events = events;
        this.jdbc = jdbc;
        this.cache = cache;
        this.publisher = publisher;
        this.properties = properties;
    }

    // ------------------------------------------------------------------------------------------------ provisioning

    /** Starts the trial of a new store (joins the store-creation transaction). */
    @Transactional
    public void createTrial() {
        UUID tenantId = TenantContext.requireTenantId();
        if (subscriptions.findFirstBy().isPresent()) {
            return;
        }
        PlanEntity plan = plans.findByCode(properties.trialPlanCode())
                .orElseThrow(() -> new IllegalStateException("Trial plan " + properties.trialPlanCode() + " not found"));
        Instant trialEnd = Instant.now().plus(Duration.ofDays(plan.getTrialDays()));
        SubscriptionEntity s = subscriptions.save(SubscriptionEntity.trial(plan.getId(), trialEnd));
        record(s, "TRIAL_STARTED", null, SubscriptionStatus.TRIALING, plan.getCode(), plan.getTrialDays() + " dni");
        cache.invalidate(tenantId);
    }

    // ------------------------------------------------------------------------------------------------ merchant actions

    @Transactional(readOnly = true)
    public SubscriptionEntity current() {
        return subscriptions.findFirstBy().orElseThrow(() -> new NotFoundException("Sklep nie ma subskrypcji."));
    }

    /** First purchase (or re-purchase after expiry/cancellation). Returns the charge to pay. */
    @Transactional
    public ChargeEntity prepareCheckout(String planCode, BillingInterval interval, String couponCode) {
        SubscriptionEntity s = lockCurrent();
        if (s.getStatus() == SubscriptionStatus.ACTIVE || s.getStatus() == SubscriptionStatus.PAST_DUE) {
            throw new BusinessRuleException("SUBSCRIPTION_ALREADY_ACTIVE",
                    "Subskrypcja jest aktywna — użyj zmiany planu lub opłać zaległą płatność.");
        }
        PlanEntity plan = purchasablePlan(planCode);
        PriceEntity price = activePrice(plan, interval);
        CouponEntity coupon = resolveCoupon(couponCode);
        if (coupon != null) {
            s.applyCoupon(coupon.getId());
        } else if (s.getCouponId() != null && s.getCouponChargesUsed() == 0) {
            s.applyCoupon(null);
        }
        charges.findUnpaid(s.getId(), Kind.INITIAL).ifPresent(this::voidCharge);
        Instant now = Instant.now();
        Instant start = s.getStatus() == SubscriptionStatus.TRIALING && s.getTrialEndsAt() != null && s.getTrialEndsAt().isAfter(now)
                ? s.getTrialEndsAt() : now;
        long couponDiscount = couponDiscount(s, price.getAmountMinor(), interval);
        ChargeEntity charge = newCharge(s, Kind.INITIAL, plan, price, start, couponDiscount,
                "Subskrypcja Shopivo — plan " + plan.getName() + " (" + label(interval) + ")", now.plus(Duration.ofDays(3)));
        record(s, "CHECKOUT_STARTED", s.getStatus(), s.getStatus(), plan.getCode(), charge.getNumber());
        return settleIfFree(s, charge);
    }

    /**
     * Plan change of an active subscription. Upgrades (higher monthly price or switch to yearly billing) take effect
     * after paying the difference, with the unused part of the current period credited. Downgrades are scheduled for
     * the end of the paid period. Returns the charge to pay, or empty when the change was only scheduled.
     */
    @Transactional
    public Optional<ChargeEntity> prepareChange(String planCode, BillingInterval interval) {
        SubscriptionEntity s = lockCurrent();
        if (s.getStatus() != SubscriptionStatus.ACTIVE) {
            throw new BusinessRuleException("SUBSCRIPTION_NOT_ACTIVE", "Zmiana planu jest możliwa dla aktywnej subskrypcji.");
        }
        PlanEntity plan = purchasablePlan(planCode);
        PriceEntity newPrice = activePrice(plan, interval);
        PriceEntity currentPrice = prices.findById(s.getPriceId()).orElseThrow();
        if (plan.getId().equals(s.getPlanId()) && interval == s.getInterval()) {
            if (s.getPendingPlanId() != null) {
                s.clearPendingChange();
                record(s, "CHANGE_CANCELED", s.getStatus(), s.getStatus(), plan.getCode(), null);
                cache.invalidate(s.getTenantId());
                return Optional.empty();
            }
            throw new BusinessRuleException("SAME_PLAN", "To jest Twój obecny plan.");
        }
        boolean immediate = newPrice.monthlyAmount() > currentPrice.monthlyAmount()
                || (interval == BillingInterval.YEAR && s.getInterval() == BillingInterval.MONTH);
        if (!immediate) {
            s.scheduleChange(plan.getId(), newPrice.getId());
            s.setCancelAtPeriodEnd(false, Instant.now());
            charges.findUnpaid(s.getId(), Kind.RENEWAL).ifPresent(this::voidCharge);
            record(s, "DOWNGRADE_SCHEDULED", s.getStatus(), s.getStatus(), plan.getCode(), "od " + s.getCurrentPeriodEnd());
            return Optional.empty();
        }
        charges.findUnpaid(s.getId(), Kind.UPGRADE).ifPresent(this::voidCharge);
        Instant now = Instant.now();
        long credit = unusedCredit(s, currentPrice, now);
        long list = newPrice.getAmountMinor();
        long afterCredit = Math.max(0, list - credit);
        long coupon = couponDiscount(s, afterCredit, interval);
        ChargeEntity charge = newCharge(s, Kind.UPGRADE, plan, newPrice, now, Math.min(list, credit) + coupon,
                "Zmiana planu na " + plan.getName() + " (" + label(interval) + "), z odliczeniem niewykorzystanej części "
                        + "bieżącego okresu", now.plus(Duration.ofDays(3)));
        record(s, "UPGRADE_STARTED", s.getStatus(), s.getStatus(), plan.getCode(), charge.getNumber());
        return Optional.of(settleIfFree(s, charge));
    }

    @Transactional
    public void cancel() {
        SubscriptionEntity s = lockCurrent();
        Instant now = Instant.now();
        switch (s.getStatus()) {
            case ACTIVE -> {
                if (s.isCancelAtPeriodEnd()) return;
                s.setCancelAtPeriodEnd(true, now);
                s.clearPendingChange();
                charges.findAllUnpaid(s.getId()).forEach(this::voidCharge);
                record(s, "CANCEL_SCHEDULED", s.getStatus(), s.getStatus(), planCode(s.getPlanId()), "z końcem okresu " + s.getCurrentPeriodEnd());
            }
            case TRIALING -> {
                // A trial simply ends; drop the pending first payment so no reminders are sent.
                charges.findAllUnpaid(s.getId()).forEach(this::voidCharge);
                s.setCancelAtPeriodEnd(true, now);
                record(s, "CANCEL_SCHEDULED", s.getStatus(), s.getStatus(), planCode(s.getPlanId()), "z końcem okresu próbnego");
            }
            case PAST_DUE -> {
                SubscriptionStatus from = s.getStatus();
                charges.findAllUnpaid(s.getId()).forEach(this::voidCharge);
                s.cancelNow(now);
                record(s, "CANCELED", from, s.getStatus(), planCode(s.getPlanId()), null);
                notice(s, Type.CANCELED, null);
            }
            default -> throw new BusinessRuleException("SUBSCRIPTION_NOT_ACTIVE", "Subskrypcja nie jest aktywna.");
        }
        cache.invalidate(s.getTenantId());
    }

    @Transactional
    public void resume() {
        SubscriptionEntity s = lockCurrent();
        if (!s.isCancelAtPeriodEnd()) {
            throw new BusinessRuleException("NOT_CANCELED", "Subskrypcja nie jest anulowana.");
        }
        s.setCancelAtPeriodEnd(false, null);
        record(s, "CANCEL_REVOKED", s.getStatus(), s.getStatus(), planCode(s.getPlanId()), null);
        cache.invalidate(s.getTenantId());
    }

    @Transactional(readOnly = true)
    public ChargeEntity unpaidCharge(UUID chargeId) {
        ChargeEntity c = charges.findById(chargeId).orElseThrow(() -> new NotFoundException("Nie znaleziono płatności."));
        if (c.getStatus() != ChargeEntity.Status.OPEN && c.getStatus() != ChargeEntity.Status.FAILED) {
            throw new BusinessRuleException("CHARGE_NOT_PAYABLE", "Ta płatność nie oczekuje na opłacenie.");
        }
        return c;
    }

    @Transactional
    public void attachPayment(UUID chargeId, String provider, String providerPaymentId, String url) {
        charges.findById(chargeId).ifPresent(c -> c.attachPayment(provider, providerPaymentId, url));
    }

    // ------------------------------------------------------------------------------------------------ payments

    public enum PaymentOutcome { APPLIED, ALREADY_APPLIED, REJECTED }

    /** Applies a verified payment. Idempotent; refuses amounts/currencies that do not match the charge. */
    @Transactional
    public PaymentOutcome applyPayment(UUID chargeId, String providerPaymentId, long paidMinor, String currency) {
        ChargeEntity charge = charges.findById(chargeId).orElseThrow(() -> new NotFoundException("Unknown charge"));
        if (charge.getStatus() == ChargeEntity.Status.PAID) {
            return PaymentOutcome.ALREADY_APPLIED;
        }
        SubscriptionEntity s = subscriptions.lock(charge.getSubscriptionId()).orElseThrow();
        if (paidMinor != charge.getTotalMinor() || !charge.getCurrency().equalsIgnoreCase(currency)) {
            log.error("Payment amount mismatch for charge {}: expected {} {}, got {} {}", charge.getNumber(),
                    charge.getTotalMinor(), charge.getCurrency(), paidMinor, currency);
            record(s, "PAYMENT_AMOUNT_MISMATCH", s.getStatus(), s.getStatus(), null, charge.getNumber());
            return PaymentOutcome.REJECTED;
        }
        // A voided charge paid anyway (e.g. old payment link): the money arrived, so honour it.
        settle(s, charge, providerPaymentId, Instant.now());
        return PaymentOutcome.APPLIED;
    }

    @Transactional
    public void paymentFailed(UUID chargeId) {
        charges.findById(chargeId).ifPresent(c -> {
            if (c.getStatus() == ChargeEntity.Status.OPEN) {
                c.markFailed();
                SubscriptionEntity s = subscriptions.findById(c.getSubscriptionId()).orElseThrow();
                record(s, "PAYMENT_FAILED", s.getStatus(), s.getStatus(), null, c.getNumber());
                notice(s, Type.PAYMENT_FAILED, c.getId());
            }
        });
    }

    private void settle(SubscriptionEntity s, ChargeEntity charge, String providerPaymentId, Instant now) {
        SubscriptionStatus from = s.getStatus();
        charge.markPaid(now, providerPaymentId);
        if (charge.getCouponId() != null) {
            redeemCoupon(s, charge.getCouponId());
        }
        boolean lapsed = from == SubscriptionStatus.EXPIRED || from == SubscriptionStatus.CANCELED;
        switch (charge.getKind()) {
            case INITIAL, UPGRADE -> {
                // A first payment made during the trial starts when the trial ends; otherwise the period starts now.
                if (charge.getKind() == Kind.UPGRADE || lapsed || charge.getPeriodStart().isBefore(now)) {
                    charge.startPeriodAt(now);
                }
                s.activate(charge.getPlanId(), charge.getPriceId(), charge.getInterval(), charge.getPeriodStart(), charge.getPeriodEnd());
                charges.findAllUnpaid(s.getId()).stream().filter(c -> !c.getId().equals(charge.getId())).forEach(this::voidCharge);
            }
            case RENEWAL -> {
                if (lapsed) {
                    charge.startPeriodAt(now);
                    s.activate(charge.getPlanId(), charge.getPriceId(), charge.getInterval(), charge.getPeriodStart(), charge.getPeriodEnd());
                } else if (!charge.getPeriodStart().isAfter(now)) {
                    // Paid after the period ended (grace): the new period starts where the old one ended.
                    s.activate(charge.getPlanId(), charge.getPriceId(), charge.getInterval(), charge.getPeriodStart(), charge.getPeriodEnd());
                }
                // Paid in advance: applied by the lifecycle job when the current period ends.
            }
        }
        record(s, "PAYMENT_RECEIVED", from, s.getStatus(), planCode(charge.getPlanId()), charge.getNumber());
        notice(s, Type.PAYMENT_RECEIVED, charge.getId());
        cache.invalidate(s.getTenantId());
    }

    // ------------------------------------------------------------------------------------------------ lifecycle (job)

    /** Trial over: activates a paid first period (if any) or expires the subscription. */
    @Transactional
    public void processTrialEnd(Instant now) {
        SubscriptionEntity s = lockCurrent();
        if (s.getStatus() != SubscriptionStatus.TRIALING || s.getTrialEndsAt() == null || s.getTrialEndsAt().isAfter(now)) {
            return;
        }
        charges.findAllUnpaid(s.getId()).forEach(this::voidCharge);
        s.expire();
        record(s, "TRIAL_EXPIRED", SubscriptionStatus.TRIALING, s.getStatus(), planCode(s.getPlanId()), null);
        notice(s, Type.TRIAL_EXPIRED, null);
        cache.invalidate(s.getTenantId());
    }

    @Transactional
    public void sendTrialEndingNotice() {
        SubscriptionEntity s = lockCurrent();
        String detail = "trial-ending:" + s.getTrialEndsAt();
        if (s.getStatus() == SubscriptionStatus.TRIALING && !s.isCancelAtPeriodEnd()
                && !events.existsBySubscriptionIdAndTypeAndDetail(s.getId(), "NOTICE_SENT", detail)) {
            record(s, "NOTICE_SENT", s.getStatus(), s.getStatus(), planCode(s.getPlanId()), detail);
            notice(s, Type.TRIAL_ENDING, null);
        }
    }

    /** Issues the renewal charge for the next period (once). Returns it when a payment link should be created. */
    @Transactional
    public Optional<ChargeEntity> issueRenewal(Instant now) {
        SubscriptionEntity s = lockCurrent();
        if (s.getStatus() != SubscriptionStatus.ACTIVE || s.isCancelAtPeriodEnd() || s.getCurrentPeriodEnd() == null) {
            return Optional.empty();
        }
        Instant start = s.getCurrentPeriodEnd();
        boolean exists = charges.findBySubscriptionId(s.getId()).stream().anyMatch(c -> c.getKind() == Kind.RENEWAL
                && c.getPeriodStart().equals(start)
                && c.getStatus() != ChargeEntity.Status.VOID);
        if (exists) {
            return Optional.empty();
        }
        // An unpaid renewal for another period (e.g. the period was changed by an upgrade) is stale.
        charges.findUnpaid(s.getId(), Kind.RENEWAL).ifPresent(this::voidCharge);
        UUID planId = s.getPendingPlanId() != null ? s.getPendingPlanId() : s.getPlanId();
        UUID priceId = s.getPendingPriceId() != null ? s.getPendingPriceId() : s.getPriceId();
        PlanEntity plan = plans.findById(planId).orElseThrow();
        PriceEntity price = prices.findById(priceId).orElseThrow();
        long discount = couponDiscount(s, price.getAmountMinor(), price.getInterval());
        ChargeEntity charge = newCharge(s, Kind.RENEWAL, plan, price, start, discount,
                "Odnowienie subskrypcji Shopivo — plan " + plan.getName() + " (" + label(price.getInterval()) + ")", start);
        record(s, "RENEWAL_ISSUED", s.getStatus(), s.getStatus(), plan.getCode(), charge.getNumber());
        ChargeEntity settled = settleIfFree(s, charge);
        if (settled.getStatus() == ChargeEntity.Status.OPEN) {
            notice(s, Type.PAYMENT_DUE, settled.getId());
            return Optional.of(settled);
        }
        return Optional.empty();
    }

    /** The paid period ended: roll over to a paid renewal, cancel, or enter the grace period. */
    @Transactional
    public void processPeriodEnd(Instant now) {
        SubscriptionEntity s = lockCurrent();
        if (s.getStatus() != SubscriptionStatus.ACTIVE || s.getCurrentPeriodEnd() == null || s.getCurrentPeriodEnd().isAfter(now)) {
            return;
        }
        Instant end = s.getCurrentPeriodEnd();
        Optional<ChargeEntity> paidRenewal = charges.findBySubscriptionId(s.getId()).stream()
                .filter(c -> c.getKind() == Kind.RENEWAL
                        && c.getStatus() == ChargeEntity.Status.PAID && c.getPeriodStart().equals(end))
                .findFirst();
        String plan = planCode(s.getPlanId());
        if (paidRenewal.isPresent()) {
            ChargeEntity c = paidRenewal.get();
            s.activate(c.getPlanId(), c.getPriceId(), c.getInterval(), c.getPeriodStart(), c.getPeriodEnd());
            record(s, "RENEWED", SubscriptionStatus.ACTIVE, s.getStatus(), planCode(c.getPlanId()), c.getNumber());
        } else if (s.isCancelAtPeriodEnd()) {
            charges.findAllUnpaid(s.getId()).forEach(this::voidCharge);
            s.cancelNow(now);
            record(s, "CANCELED", SubscriptionStatus.ACTIVE, s.getStatus(), plan, null);
            notice(s, Type.CANCELED, null);
        } else {
            s.markPastDue(now.plus(properties.gracePeriod()));
            record(s, "PAST_DUE", SubscriptionStatus.ACTIVE, s.getStatus(), plan, "dostęp do " + s.getGraceUntil());
            notice(s, Type.PAST_DUE, charges.findUnpaid(s.getId(), Kind.RENEWAL).map(ChargeEntity::getId).orElse(null));
        }
        cache.invalidate(s.getTenantId());
    }

    @Transactional
    public void processGraceEnd(Instant now) {
        SubscriptionEntity s = lockCurrent();
        if (s.getStatus() != SubscriptionStatus.PAST_DUE || s.getGraceUntil() == null || s.getGraceUntil().isAfter(now)) {
            return;
        }
        charges.findAllUnpaid(s.getId()).forEach(this::voidCharge);
        s.expire();
        record(s, "EXPIRED", SubscriptionStatus.PAST_DUE, s.getStatus(), planCode(s.getPlanId()), null);
        notice(s, Type.EXPIRED, null);
        cache.invalidate(s.getTenantId());
    }

    /** Unpaid charges due for a reminder; marks them reminded and publishes the notices. */
    @Transactional
    public void remindUnpaid(Instant now) {
        SubscriptionEntity s = current();
        for (ChargeEntity c : charges.findAllUnpaid(s.getId())) {
            boolean due = !c.getDueAt().isAfter(now.plus(Duration.ofDays(3)));
            boolean spaced = c.getLastReminderAt() == null || !c.getLastReminderAt().plus(properties.reminderInterval()).isAfter(now);
            if (due && spaced && c.getRemindersSent() < properties.maxReminders()) {
                c.reminded(now);
                notice(s, Type.PAYMENT_REMINDER, c.getId());
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ admin

    @Transactional
    public void extendTrial(Instant until, String reason) {
        SubscriptionEntity s = lockCurrent();
        if (s.getStatus() != SubscriptionStatus.TRIALING && !(s.getStatus() == SubscriptionStatus.EXPIRED && s.getCurrentPeriodEnd() == null)) {
            throw new BusinessRuleException("NOT_IN_TRIAL", "Okres próbny można przedłużyć tylko przed pierwszą płatnością.");
        }
        if (!until.isAfter(Instant.now())) {
            throw new BusinessRuleException("INVALID_DATE", "Data musi być w przyszłości.");
        }
        SubscriptionStatus from = s.getStatus();
        s.extendTrial(until);
        record(s, "TRIAL_EXTENDED", from, s.getStatus(), planCode(s.getPlanId()), reason);
        cache.invalidate(s.getTenantId());
    }

    @Transactional
    public void recordFairUse(String metric, long value, long limit, String period) {
        SubscriptionEntity s = current();
        String detail = "fair-use:" + metric + ":" + period;
        if (!events.existsBySubscriptionIdAndTypeAndDetail(s.getId(), "FAIR_USE_EXCEEDED", detail)) {
            record(s, "FAIR_USE_EXCEEDED", s.getStatus(), s.getStatus(), planCode(s.getPlanId()), detail);
            notice(s, Type.FAIR_USE_EXCEEDED, null);
            log.info("Tenant {} exceeded fair use of {}: {} / {}", s.getTenantId(), metric, value, limit);
        }
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private SubscriptionEntity lockCurrent() {
        SubscriptionEntity s = current();
        return subscriptions.lock(s.getId()).orElseThrow();
    }

    private PlanEntity purchasablePlan(String code) {
        PlanEntity plan = plans.findByCode(code == null ? "" : code.trim().toUpperCase())
                .orElseThrow(() -> new NotFoundException("Nie znaleziono planu."));
        if (!plan.isActive() || !plan.isPublicPlan()) {
            throw new BusinessRuleException("PLAN_UNAVAILABLE", "Ten plan nie jest dostępny.");
        }
        return plan;
    }

    private PriceEntity activePrice(PlanEntity plan, BillingInterval interval) {
        return prices.findByPlanIdAndIntervalAndCurrencyAndActiveTrue(plan.getId(), interval, properties.currency())
                .orElseThrow(() -> new BusinessRuleException("PRICE_UNAVAILABLE", "Plan nie jest dostępny w tym okresie rozliczeniowym."));
    }

    private CouponEntity resolveCoupon(String code) {
        if (code == null || code.isBlank()) return null;
        CouponEntity coupon = coupons.findByCode(code.trim().toUpperCase())
                .filter(c -> c.isRedeemable(Instant.now()))
                .orElseThrow(() -> new BusinessRuleException("COUPON_INVALID", "Kod rabatowy jest nieprawidłowy lub wygasł."));
        Integer used = jdbc.queryForObject("select count(*) from coupon_redemptions where coupon_id = ? and tenant_id = ?",
                Integer.class, coupon.getId(), TenantContext.requireTenantId());
        if (used != null && used > 0) {
            throw new BusinessRuleException("COUPON_ALREADY_USED", "Ten kod rabatowy został już wykorzystany w tym sklepie.");
        }
        return coupon;
    }

    private long couponDiscount(SubscriptionEntity s, long amount, BillingInterval interval) {
        if (s.getCouponId() == null) return 0;
        return coupons.findById(s.getCouponId())
                .filter(c -> c.appliesAfter(s.getCouponChargesUsed(), interval.months()))
                .map(c -> c.discountFor(amount, properties.currency()))
                .orElse(0L);
    }

    private void redeemCoupon(SubscriptionEntity s, UUID couponId) {
        if (s.getCouponChargesUsed() == 0) {
            int inserted = jdbc.update("insert into coupon_redemptions (coupon_id, tenant_id) values (?, ?) on conflict do nothing",
                    couponId, s.getTenantId());
            if (inserted > 0) coupons.findById(couponId).ifPresent(CouponEntity::redeem);
        }
        s.couponUsed();
    }

    private ChargeEntity newCharge(SubscriptionEntity s, Kind kind, PlanEntity plan, PriceEntity price, Instant start,
            long discount, String description, Instant dueAt) {
        long safeDiscount = Math.min(Math.max(discount, 0), price.getAmountMinor());
        String number = "SUB-" + java.time.Year.now(java.time.ZoneId.of("Europe/Warsaw")) + "-" + String.format("%06d", charges.nextNumber());
        UUID couponId = s.getCouponId() != null && couponDiscount(s, price.getAmountMinor(), price.getInterval()) > 0 ? s.getCouponId() : null;
        return charges.saveAndFlush(new ChargeEntity(s.getId(), number, kind, plan.getId(), price.getId(), price.getInterval(),
                start, price.getInterval().addTo(start), price.getAmountMinor(), safeDiscount, properties.vatRateBps(),
                price.getCurrency(), description, couponId, dueAt));
    }

    /** 100% discounts are settled immediately — there is nothing to collect. */
    private ChargeEntity settleIfFree(SubscriptionEntity s, ChargeEntity charge) {
        if (charge.getTotalMinor() == 0) {
            settle(s, charge, null, Instant.now());
        }
        return charge;
    }

    private long unusedCredit(SubscriptionEntity s, PriceEntity currentPrice, Instant now) {
        if (s.getCurrentPeriodStart() == null || s.getCurrentPeriodEnd() == null || !s.getCurrentPeriodEnd().isAfter(now)) {
            return 0;
        }
        Instant from = s.getCurrentPeriodStart().isAfter(now) ? s.getCurrentPeriodStart() : now;
        double total = Duration.between(s.getCurrentPeriodStart(), s.getCurrentPeriodEnd()).toMillis();
        double remaining = Duration.between(from, s.getCurrentPeriodEnd()).toMillis();
        if (total <= 0) return 0;
        // Credit what was actually charged for this period (net of discounts) — not the list price.
        long paid = charges.findBySubscriptionId(s.getId()).stream()
                .filter(c -> c.getStatus() == ChargeEntity.Status.PAID
                        && c.getPeriodEnd().equals(s.getCurrentPeriodEnd()))
                .mapToLong(ChargeEntity::getAmountMinor).findFirst().orElse(currentPrice.getAmountMinor());
        return Math.round(paid * Math.min(1.0, remaining / total));
    }

    /**
     * Flushed immediately: Hibernate executes INSERTs before UPDATEs within one flush, so a replacement charge would
     * otherwise collide with the "one open charge per kind" unique index.
     */
    private void voidCharge(ChargeEntity c) {
        c.voidCharge();
        charges.flush();
    }

    private String planCode(UUID planId) {
        return planId == null ? null : plans.findById(planId).map(PlanEntity::getCode).orElse(null);
    }

    private void record(SubscriptionEntity s, String type, SubscriptionStatus from, SubscriptionStatus to, String plan, String detail) {
        events.save(new SubscriptionEventEntity(s.getId(), type, from == null ? null : from.name(),
                to == null ? null : to.name(), plan, detail == null ? null : detail.substring(0, Math.min(detail.length(), 500))));
    }

    private void notice(SubscriptionEntity s, Type type, UUID chargeId) {
        publisher.publishEvent(new SubscriptionNotice(s.getTenantId(), type, chargeId));
    }

    static String label(BillingInterval interval) {
        return interval == BillingInterval.YEAR ? "rocznie" : "miesięcznie";
    }

    /** All charges of the current tenant, newest first. */
    @Transactional(readOnly = true)
    public List<ChargeEntity> charges() {
        return charges.findAllByOrderByIssuedAtDesc();
    }
}

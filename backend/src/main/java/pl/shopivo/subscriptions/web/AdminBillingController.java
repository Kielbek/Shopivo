package pl.shopivo.subscriptions.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.subscriptions.BillingAdministration;
import pl.shopivo.subscriptions.BillingInterval;
import pl.shopivo.subscriptions.PlanCatalog;
import pl.shopivo.subscriptions.SubscriptionService;
import pl.shopivo.subscriptions.SubscriptionStatus;
import pl.shopivo.subscriptions.SubscriptionViews.ChargeView;
import pl.shopivo.subscriptions.SubscriptionViews.CouponView;
import pl.shopivo.subscriptions.SubscriptionViews.HistoryView;
import pl.shopivo.subscriptions.SubscriptionViews.PlanView;
import pl.shopivo.subscriptions.SubscriptionViews.SubscriptionView;
import pl.shopivo.subscriptions.internal.CouponEntity;
import pl.shopivo.subscriptions.internal.SubscriptionEngine;

/** Platform administration of plans, coupons and subscriptions. Reads: platform staff; changes: PLATFORM_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin")
@Tag(name = "Platform administration — billing")
class AdminBillingController {

    private final PlanCatalog plans;
    private final BillingAdministration admin;
    private final SubscriptionService subscriptions;
    private final SubscriptionEngine engine;
    private final AuditLog auditLog;
    private final TransactionTemplate tx;

    AdminBillingController(PlanCatalog plans, BillingAdministration admin, SubscriptionService subscriptions,
            SubscriptionEngine engine, AuditLog auditLog, TransactionTemplate tx) {
        this.plans = plans;
        this.admin = admin;
        this.subscriptions = subscriptions;
        this.engine = engine;
        this.auditLog = auditLog;
        this.tx = tx;
    }

    record PlanRequest(@Size(max = 40) String code, @NotBlank @Size(max = 100) String name, @Size(max = 500) String description,
            int sortOrder, boolean active, boolean publicPlan, @Min(0) @Max(90) int trialDays,
            @NotNull Map<String, String> entitlements, @NotNull Map<BillingInterval, Long> prices, long version) {

        PlanCatalog.PlanInput input() {
            return new PlanCatalog.PlanInput(name, description, sortOrder, active, publicPlan, trialDays, entitlements, prices);
        }
    }

    record PlansResponse(List<PlanView> plans, List<PlansController.EntitlementDefinition> entitlements) {
    }

    record CouponRequest(@NotBlank @Size(max = 40) String code, @Size(max = 200) String description, Integer percentOff,
            Long amountOffMinor, @NotNull CouponEntity.Duration duration, Integer durationMonths, Integer maxRedemptions,
            Instant validUntil) {
    }

    record ActiveRequest(boolean active) {
    }

    record ExtendTrialRequest(@Min(1) @Max(90) int days, @NotBlank @Size(max = 300) String reason) {
    }

    record OverrideRequest(@NotBlank String value, @NotBlank @Size(max = 300) String reason, Instant expiresAt) {
    }

    record SubscriptionDetail(BillingAdministration.SubscriptionRow summary, SubscriptionView subscription,
            List<ChargeView> charges, List<HistoryView> history, List<BillingAdministration.OverrideView> overrides) {
    }

    // ---------------------------------------------------------------- plans

    @GetMapping("/plans")
    PlansResponse plans() {
        return new PlansResponse(plans.all(), PlansController.definitions());
    }

    @PostMapping("/plans")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    PlanView createPlan(@Valid @RequestBody PlanRequest request) {
        return TenantContext.callAsSystem(() -> plans.create(request.code(), request.input()));
    }

    @PutMapping("/plans/{planId}")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    PlanView updatePlan(@PathVariable UUID planId, @Valid @RequestBody PlanRequest request) {
        return TenantContext.callAsSystem(() -> plans.update(planId, request.version(), request.input()));
    }

    // ---------------------------------------------------------------- coupons

    @GetMapping("/coupons")
    List<CouponView> coupons() {
        return admin.coupons();
    }

    @PostMapping("/coupons")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    CouponView createCoupon(@Valid @RequestBody CouponRequest r) {
        return TenantContext.callAsSystem(() -> admin.createCoupon(new BillingAdministration.CouponInput(r.code(), r.description(),
                r.percentOff(), r.amountOffMinor(), r.duration(), r.durationMonths(), r.maxRedemptions(), r.validUntil())));
    }

    @PostMapping("/coupons/{couponId}/active")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    CouponView setCouponActive(@PathVariable UUID couponId, @RequestBody ActiveRequest request) {
        return TenantContext.callAsSystem(() -> admin.setCouponActive(couponId, request.active()));
    }

    // ---------------------------------------------------------------- subscriptions

    @GetMapping("/billing/stats")
    BillingAdministration.BillingStats stats() {
        return TenantContext.callAsSystem(admin::stats);
    }

    @GetMapping("/subscriptions")
    List<BillingAdministration.SubscriptionRow> subscriptions(@RequestParam(required = false) SubscriptionStatus status,
            @RequestParam(required = false) String q) {
        return TenantContext.callAsSystem(() -> admin.subscriptions(status, q));
    }

    @GetMapping("/subscriptions/{tenantId}")
    SubscriptionDetail subscription(@PathVariable UUID tenantId) {
        var summary = TenantContext.callAsSystem(() -> admin.subscription(tenantId));
        var overrides = TenantContext.callAsSystem(() -> admin.overrides(tenantId));
        // Tenant-scoped reads run in the tenant's context, exactly like the merchant sees them.
        return TenantContext.callInTenant(tenantId, () -> new SubscriptionDetail(summary, subscriptions.details(),
                subscriptions.charges(), subscriptions.history(), overrides));
    }

    @PostMapping("/subscriptions/{tenantId}/extend-trial")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void extendTrial(@PathVariable UUID tenantId, @Valid @RequestBody ExtendTrialRequest request) {
        TenantContext.runInTenant(tenantId, () -> {
            var current = engine.current();
            Instant base = current.getTrialEndsAt() != null && current.getTrialEndsAt().isAfter(Instant.now())
                    ? current.getTrialEndsAt() : Instant.now();
            engine.extendTrial(base.plus(request.days(), ChronoUnit.DAYS), request.reason().trim());
        });
        TenantContext.runAsSystem(() -> tx.executeWithoutResult(s -> auditLog.record(
                new AuditEntry("admin.subscription.trial_extended", tenantId, "subscription", null, Map.of("days", request.days())))));
    }

    @PutMapping("/subscriptions/{tenantId}/overrides/{key}")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void setOverride(@PathVariable UUID tenantId, @PathVariable String key, @Valid @RequestBody OverrideRequest request) {
        TenantContext.runAsSystem(() -> admin.setOverride(tenantId, key, request.value(), request.reason(), request.expiresAt()));
    }

    @DeleteMapping("/subscriptions/{tenantId}/overrides/{key}")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeOverride(@PathVariable UUID tenantId, @PathVariable String key) {
        TenantContext.runAsSystem(() -> admin.removeOverride(tenantId, key));
    }

    // ---------------------------------------------------------------- usage

    @GetMapping("/billing/usage")
    BillingAdministration.UsageReport usage(@RequestParam(required = false) String month) {
        LocalDate period;
        try {
            period = month == null || month.isBlank() ? LocalDate.now(ZoneId.of("Europe/Warsaw")) : YearMonth.parse(month).atDay(1);
        } catch (java.time.format.DateTimeParseException e) {
            throw new pl.shopivo.shared.error.BusinessRuleException("INVALID_MONTH", "Miesiąc w formacie RRRR-MM.");
        }
        return TenantContext.callAsSystem(() -> admin.usage(period));
    }
}

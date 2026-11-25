package pl.shopivo.subscriptions;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.subscriptions.SubscriptionViews.CouponView;
import pl.shopivo.subscriptions.internal.BillingStateCache;
import pl.shopivo.subscriptions.internal.CouponEntity;
import pl.shopivo.subscriptions.internal.CouponRepository;

/**
 * Platform-administrator view of subscriptions: list, stats (MRR/ARR), coupons, per-tenant entitlement overrides and
 * the usage/profitability report. All reads span tenants, so callers run these in system context.
 */
@Service
public class BillingAdministration {

    private final JdbcTemplate jdbc;
    private final CouponRepository coupons;
    private final BillingStateCache cache;
    private final AuditLog auditLog;
    private final BillingProperties properties;

    BillingAdministration(JdbcTemplate jdbc, CouponRepository coupons, BillingStateCache cache, AuditLog auditLog,
            BillingProperties properties) {
        this.jdbc = jdbc;
        this.coupons = coupons;
        this.cache = cache;
        this.auditLog = auditLog;
        this.properties = properties;
    }

    public record SubscriptionRow(UUID tenantId, String storeName, String tenantStatus, SubscriptionStatus status,
            String planCode, String planName, BillingInterval interval, long monthlyNetMinor, Instant trialEndsAt,
            Instant currentPeriodEnd, boolean cancelAtPeriodEnd, Instant graceUntil, long unpaidTotalMinor) {
    }

    public record BillingStats(long mrrMinor, long arrMinor, Map<String, Long> byStatus, Map<String, Long> activeByPlan,
            long trialsEndingIn7Days, long collectedLast30DaysNetMinor, long unpaidTotalMinor, String currency) {
    }

    public record OverrideView(String key, String label, String value, String reason, Instant expiresAt, Instant createdAt) {
    }

    public record UsageRow(UUID tenantId, String storeName, String planCode, SubscriptionStatus status,
            long revenueMonthlyNetMinor, Map<String, Long> usage, Map<String, Long> limits, long estimatedCostMinor,
            long marginMinor, List<String> fairUseExceeded) {
    }

    public record UsageReport(LocalDate period, List<UsageRow> rows, BillingProperties.CostModel costModel, String currency) {
    }

    public record CouponInput(String code, String description, Integer percentOff, Long amountOffMinor,
            CouponEntity.Duration duration, Integer durationMonths, Integer maxRedemptions, Instant validUntil) {
    }

    private static final String SUBSCRIPTION_SELECT = """
            select s.tenant_id, t.name as store_name, t.status as tenant_status, s.status, p.code, p.name as plan_name,
                   s.billing_interval, pr.amount_minor, s.trial_ends_at, s.current_period_end, s.cancel_at_period_end,
                   s.grace_until,
                   coalesce((select sum(c.total_minor) from subscription_charges c
                             where c.subscription_id = s.id and c.status in ('OPEN', 'FAILED')), 0) as unpaid
            from subscriptions s
            join tenants t on t.id = s.tenant_id
            join subscription_plans p on p.id = s.plan_id
            left join plan_prices pr on pr.id = s.price_id
            """;

    @Transactional(readOnly = true)
    public List<SubscriptionRow> subscriptions(SubscriptionStatus status, String query) {
        requireSystem();
        StringBuilder sql = new StringBuilder(SUBSCRIPTION_SELECT).append(" where 1 = 1");
        List<Object> args = new ArrayList<>();
        if (status != null) {
            sql.append(" and s.status = ?");
            args.add(status.name());
        }
        if (query != null && !query.isBlank()) {
            sql.append(" and lower(t.name) like ?");
            args.add("%" + query.trim().toLowerCase().replace("%", "\\%").replace("_", "\\_") + "%");
        }
        sql.append(" order by s.updated_at desc limit 500");
        return jdbc.query(sql.toString(), (rs, i) -> row(rs), args.toArray());
    }

    @Transactional(readOnly = true)
    public SubscriptionRow subscription(UUID tenantId) {
        requireSystem();
        return jdbc.query(SUBSCRIPTION_SELECT + " where s.tenant_id = ?", (rs, i) -> row(rs), tenantId).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Sklep nie ma subskrypcji."));
    }

    @Transactional(readOnly = true)
    public BillingStats stats() {
        requireSystem();
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (SubscriptionStatus s : SubscriptionStatus.values()) byStatus.put(s.name(), 0L);
        jdbc.query("select status, count(*) from subscriptions group by status", rs -> {
            byStatus.put(rs.getString(1), rs.getLong(2));
        });
        Map<String, Long> byPlan = new LinkedHashMap<>();
        long[] mrr = {0};
        // MRR: list price (monthly equivalent) of subscriptions that pay — ACTIVE and PAST_DUE (in grace).
        jdbc.query("""
                select p.code, count(*), sum(case when pr.billing_interval = 'YEAR' then round(pr.amount_minor / 12.0) else pr.amount_minor end)
                from subscriptions s join subscription_plans p on p.id = s.plan_id join plan_prices pr on pr.id = s.price_id
                where s.status in ('ACTIVE', 'PAST_DUE') group by p.code, p.sort_order order by p.sort_order
                """, rs -> {
            byPlan.put(rs.getString(1), rs.getLong(2));
            mrr[0] += rs.getLong(3);
        });
        Instant now = Instant.now();
        Long trialsEnding = jdbc.queryForObject("select count(*) from subscriptions where status = 'TRIALING' and trial_ends_at between ? and ?",
                Long.class, java.sql.Timestamp.from(now), java.sql.Timestamp.from(now.plus(7, ChronoUnit.DAYS)));
        Long collected = jdbc.queryForObject("select coalesce(sum(amount_minor), 0) from subscription_charges where status = 'PAID' and paid_at >= ?",
                Long.class, java.sql.Timestamp.from(now.minus(30, ChronoUnit.DAYS)));
        Long unpaid = jdbc.queryForObject("select coalesce(sum(total_minor), 0) from subscription_charges where status in ('OPEN', 'FAILED')", Long.class);
        return new BillingStats(mrr[0], mrr[0] * 12, byStatus, byPlan, nz(trialsEnding), nz(collected), nz(unpaid), properties.currency());
    }

    // ------------------------------------------------------------------------------------------------ coupons

    @Transactional(readOnly = true)
    public List<CouponView> coupons() {
        return coupons.findAllByOrderByCodeAsc().stream().map(BillingAdministration::couponView).toList();
    }

    @Transactional
    public CouponView createCoupon(CouponInput in) {
        String code = in.code() == null ? "" : in.code().trim().toUpperCase();
        if (!code.matches("^[A-Z0-9_-]{3,40}$")) {
            throw new BusinessRuleException("INVALID_COUPON_CODE", "Kod: 3–40 znaków (litery, cyfry, - i _).");
        }
        if (coupons.findByCode(code).isPresent()) {
            throw new ConflictException("COUPON_CODE_TAKEN", "Kupon o tym kodzie już istnieje.");
        }
        boolean percent = in.percentOff() != null;
        if (percent == (in.amountOffMinor() != null)) {
            throw new BusinessRuleException("INVALID_COUPON_VALUE", "Podaj rabat procentowy albo kwotowy.");
        }
        if (percent && (in.percentOff() < 1 || in.percentOff() > 100) || !percent && in.amountOffMinor() <= 0) {
            throw new BusinessRuleException("INVALID_COUPON_VALUE", "Nieprawidłowa wartość rabatu.");
        }
        if (in.duration() == CouponEntity.Duration.REPEATING && (in.durationMonths() == null || in.durationMonths() < 1 || in.durationMonths() > 36)) {
            throw new BusinessRuleException("INVALID_COUPON_DURATION", "Dla rabatu powtarzalnego podaj liczbę miesięcy (1–36).");
        }
        CouponEntity coupon = coupons.save(new CouponEntity(code, blank(in.description()), in.percentOff(), in.amountOffMinor(),
                percent ? null : properties.currency(), in.duration(),
                in.duration() == CouponEntity.Duration.REPEATING ? in.durationMonths() : null, in.maxRedemptions(), in.validUntil()));
        auditLog.record(AuditEntry.platform("admin.coupon.created", "coupon", coupon.getId()).with(Map.of("code", code)));
        return couponView(coupon);
    }

    @Transactional
    public CouponView setCouponActive(UUID id, boolean active) {
        CouponEntity coupon = coupons.findById(id).orElseThrow(() -> new NotFoundException("Nie znaleziono kuponu."));
        coupon.setActive(active);
        auditLog.record(AuditEntry.platform(active ? "admin.coupon.activated" : "admin.coupon.deactivated", "coupon", id));
        return couponView(coupon);
    }

    // ------------------------------------------------------------------------------------------------ overrides

    @Transactional(readOnly = true)
    public List<OverrideView> overrides(UUID tenantId) {
        requireSystem();
        return jdbc.query("select key, value, reason, expires_at, created_at from entitlement_overrides where tenant_id = ? order by key",
                (rs, i) -> new OverrideView(rs.getString(1),
                        EntitlementKey.of(rs.getString(1)).map(EntitlementKey::label).orElse(rs.getString(1)),
                        rs.getString(2), rs.getString(3), ts(rs, 4), ts(rs, 5)), tenantId);
    }

    @Transactional
    public void setOverride(UUID tenantId, String key, String value, String reason, Instant expiresAt) {
        requireSystem();
        EntitlementKey k = EntitlementKey.of(key).orElseThrow(() -> new BusinessRuleException("UNKNOWN_ENTITLEMENT", "Nieznany limit."));
        String normalised;
        try {
            normalised = k.normalise(value);
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleException("INVALID_ENTITLEMENT", e.getMessage());
        }
        if (reason == null || reason.isBlank()) {
            throw new BusinessRuleException("REASON_REQUIRED", "Podaj powód wyjątku.");
        }
        jdbc.update("""
                insert into entitlement_overrides (tenant_id, key, value, reason, created_by, expires_at) values (?, ?, ?, ?, ?, ?)
                on conflict (tenant_id, key) do update set value = excluded.value, reason = excluded.reason,
                    created_by = excluded.created_by, expires_at = excluded.expires_at, created_at = now()
                """, tenantId, k.key(), normalised, reason.trim(), SecurityUtils.requireUser().id(),
                expiresAt == null ? null : java.sql.Timestamp.from(expiresAt));
        auditLog.record(new AuditEntry("admin.entitlement.override.set", tenantId, "entitlement", k.key(),
                Map.of("value", normalised)));
        cache.invalidate(tenantId);
    }

    @Transactional
    public void removeOverride(UUID tenantId, String key) {
        requireSystem();
        jdbc.update("delete from entitlement_overrides where tenant_id = ? and key = ?", tenantId, key);
        auditLog.record(new AuditEntry("admin.entitlement.override.removed", tenantId, "entitlement", key, Map.of()));
        cache.invalidate(tenantId);
    }

    // ------------------------------------------------------------------------------------------------ usage report

    /**
     * Usage, revenue and estimated infrastructure cost per tenant for a month. Answers "does a store on the cheapest
     * plan cost us more than it pays?" — the margin is revenue (monthly net list price; 0 during trial) minus the
     * cost model applied to measured usage.
     */
    @Transactional(readOnly = true)
    public UsageReport usage(LocalDate month) {
        requireSystem();
        LocalDate period = month.withDayOfMonth(1);
        Map<UUID, Map<String, Long>> usage = new HashMap<>();
        jdbc.query("select tenant_id, metric, value from tenant_usage where period = ?", rs -> {
            usage.computeIfAbsent(rs.getObject(1, UUID.class), k -> new HashMap<>()).put(rs.getString(2), rs.getLong(3));
        }, period);
        BillingProperties.CostModel cost = properties.costModel();
        List<UsageRow> rows = jdbc.query(SUBSCRIPTION_SELECT + " order by t.name", (rs, i) -> {
            SubscriptionRow sub = row(rs);
            Map<String, Long> u = usage.getOrDefault(sub.tenantId(), Map.of());
            var state = cache.get(sub.tenantId());
            Map<String, Long> limits = new LinkedHashMap<>();
            List<String> exceeded = new ArrayList<>();
            for (EntitlementKey key : EntitlementKey.values()) {
                if (key.usageMetric() == null) continue;
                long limit = state.value(key.key()).map(Entitlements::parse).orElse(0L);
                limits.put(key.usageMetric(), limit);
                if (key.kind() == EntitlementKey.Kind.FAIR_USE && limit >= 0 && u.getOrDefault(key.usageMetric(), 0L) > limit) {
                    exceeded.add(key.usageMetric());
                }
            }
            long requests = u.getOrDefault("storefront.requests", 0L);
            long orders = u.getOrDefault("orders", 0L);
            long storageGb = u.getOrDefault("storage.mb", 0L) / 1024;
            long estimated = cost.baseMonthlyMinor() + Math.round(requests / 1_000_000.0 * cost.perMillionStorefrontRequestsMinor())
                    + orders * cost.perOrderMinor() + storageGb * cost.perGbStorageMinor();
            boolean paying = sub.status() == SubscriptionStatus.ACTIVE || sub.status() == SubscriptionStatus.PAST_DUE;
            long revenue = paying ? sub.monthlyNetMinor() : 0;
            return new UsageRow(sub.tenantId(), sub.storeName(), sub.planCode(), sub.status(), revenue, u, limits,
                    estimated, revenue - estimated, exceeded);
        });
        // Context-sensitive cache loads above run inside this (system) transaction — fine, the context matches.
        return new UsageReport(period, rows, cost, properties.currency());
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private static SubscriptionRow row(ResultSet rs) throws SQLException {
        String interval = rs.getString("billing_interval");
        long amount = rs.getLong("amount_minor");
        BillingInterval bi = interval == null ? null : BillingInterval.valueOf(interval);
        long monthly = bi == null ? 0 : Math.round((double) amount / bi.months());
        return new SubscriptionRow(rs.getObject("tenant_id", UUID.class), rs.getString("store_name"),
                rs.getString("tenant_status"), SubscriptionStatus.valueOf(rs.getString("status")), rs.getString("code"),
                rs.getString("plan_name"), bi, monthly, ts(rs, "trial_ends_at"), ts(rs, "current_period_end"),
                rs.getBoolean("cancel_at_period_end"), ts(rs, "grace_until"), rs.getLong("unpaid"));
    }

    private static Instant ts(ResultSet rs, String column) throws SQLException {
        var t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    private static Instant ts(ResultSet rs, int column) throws SQLException {
        var t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    static CouponView couponView(CouponEntity c) {
        return new CouponView(c.getId(), c.getCode(), c.getDescription(), c.getPercentOff(), c.getAmountOffMinor(),
                c.getCurrency(), c.getDuration().name(), c.getDurationMonths(), c.getMaxRedemptions(), c.getRedeemedCount(),
                c.getValidUntil(), c.isActive());
    }

    private static void requireSystem() {
        if (!TenantContext.isSystem()) {
            throw new IllegalStateException("Billing administration requires system context");
        }
    }

    private static long nz(Long v) {
        return v == null ? 0 : v;
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

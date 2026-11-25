package pl.shopivo.subscriptions;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.subscriptions.SubscriptionViews.PlanView;
import pl.shopivo.subscriptions.SubscriptionViews.PriceView;
import pl.shopivo.subscriptions.internal.BillingStateCache;
import pl.shopivo.subscriptions.internal.PlanEntity;
import pl.shopivo.subscriptions.internal.PlanRepository;
import pl.shopivo.subscriptions.internal.PriceEntity;
import pl.shopivo.subscriptions.internal.PriceRepository;

/**
 * Plans, prices and entitlements — data editable by the platform administrator. A price change never touches
 * existing subscribers: a new price row is created and the old one is retired (subscribers keep it until they change
 * plan).
 */
@Service
public class PlanCatalog {

    private final PlanRepository plans;
    private final PriceRepository prices;
    private final JdbcTemplate jdbc;
    private final BillingStateCache cache;
    private final AuditLog auditLog;
    private final BillingProperties properties;

    PlanCatalog(PlanRepository plans, PriceRepository prices, JdbcTemplate jdbc, BillingStateCache cache,
            AuditLog auditLog, BillingProperties properties) {
        this.plans = plans;
        this.prices = prices;
        this.jdbc = jdbc;
        this.cache = cache;
        this.auditLog = auditLog;
        this.properties = properties;
    }

    public record PlanInput(String name, String description, int sortOrder, boolean active, boolean publicPlan,
            int trialDays, Map<String, String> entitlements, Map<BillingInterval, Long> prices) {
    }

    /** Plans offered to merchants (active, public, with at least one active price). */
    @Transactional(readOnly = true)
    public List<PlanView> publicPlans() {
        return all().stream().filter(p -> p.active() && p.publicPlan() && !p.prices().isEmpty()).toList();
    }

    @Transactional(readOnly = true)
    public List<PlanView> all() {
        List<PlanEntity> list = plans.findAllByOrderBySortOrderAsc();
        Map<UUID, List<PriceEntity>> pricesByPlan = prices.findByPlanIdInAndActiveTrue(list.stream().map(PlanEntity::getId).toList())
                .stream().collect(Collectors.groupingBy(PriceEntity::getPlanId));
        return list.stream().map(p -> view(p, pricesByPlan.getOrDefault(p.getId(), List.of()))).toList();
    }

    @Transactional(readOnly = true)
    public PlanView get(UUID id) {
        PlanEntity plan = plans.findById(id).orElseThrow(() -> new NotFoundException("Nie znaleziono planu."));
        return view(plan, prices.findByPlanIdInAndActiveTrue(List.of(id)));
    }

    @Transactional(readOnly = true)
    public Optional<PlanEntity> findByCode(String code) {
        return plans.findByCode(code);
    }

    @Transactional
    public PlanView create(String code, PlanInput input) {
        String normalised = code == null ? "" : code.trim().toUpperCase();
        if (!normalised.matches("^[A-Z][A-Z0-9_]{1,39}$")) {
            throw new BusinessRuleException("INVALID_PLAN_CODE", "Kod planu: wielkie litery, cyfry i _ (2–40 znaków).");
        }
        if (plans.findByCode(normalised).isPresent()) {
            throw new ConflictException("PLAN_CODE_TAKEN", "Plan o tym kodzie już istnieje.");
        }
        PlanEntity plan = new PlanEntity(normalised);
        apply(plan, input);
        plans.saveAndFlush(plan);
        replaceEntitlements(plan.getId(), input.entitlements());
        input.prices().forEach((interval, amount) -> setPriceInternal(plan.getId(), interval, amount));
        auditLog.record(AuditEntry.platform("admin.plan.created", "plan", plan.getId()).with(Map.of("code", normalised)));
        cache.invalidatePlans();
        return get(plan.getId());
    }

    @Transactional
    public PlanView update(UUID id, long version, PlanInput input) {
        PlanEntity plan = plans.findById(id).orElseThrow(() -> new NotFoundException("Nie znaleziono planu."));
        if (plan.getVersion() != version) {
            throw new ConflictException("VERSION_CONFLICT", "Plan został w międzyczasie zmieniony. Odśwież stronę.");
        }
        if (!input.active() && plan.getCode().equals(properties.trialPlanCode())) {
            throw new BusinessRuleException("TRIAL_PLAN_REQUIRED", "Nie można wyłączyć planu używanego w okresie próbnym.");
        }
        apply(plan, input);
        replaceEntitlements(id, input.entitlements());
        input.prices().forEach((interval, amount) -> setPriceInternal(id, interval, amount));
        auditLog.record(AuditEntry.platform("admin.plan.updated", "plan", id).with(Map.of("code", plan.getCode())));
        cache.invalidatePlans();
        return get(id);
    }

    private void apply(PlanEntity plan, PlanInput input) {
        if (input.trialDays() < 0 || input.trialDays() > 90) {
            throw new BusinessRuleException("INVALID_TRIAL", "Okres próbny: 0–90 dni.");
        }
        plan.update(input.name().trim(), blankToNull(input.description()), input.sortOrder(), input.active(),
                input.publicPlan(), input.trialDays());
    }

    private void replaceEntitlements(UUID planId, Map<String, String> values) {
        Map<String, String> normalised = new LinkedHashMap<>();
        for (EntitlementKey key : EntitlementKey.values()) {
            String raw = values == null ? null : values.get(key.key());
            if (raw == null) {
                throw new BusinessRuleException("ENTITLEMENT_MISSING", "Brak wartości: " + key.label());
            }
            try {
                normalised.put(key.key(), key.normalise(raw));
            } catch (IllegalArgumentException e) {
                throw new BusinessRuleException("INVALID_ENTITLEMENT", e.getMessage());
            }
        }
        jdbc.update("delete from plan_entitlements where plan_id = ?", planId);
        normalised.forEach((k, v) -> jdbc.update("insert into plan_entitlements (plan_id, key, value) values (?, ?, ?)", planId, k, v));
    }

    /** New price for new subscribers; current subscribers keep their price (grandfathering). Null/negative = remove. */
    private void setPriceInternal(UUID planId, BillingInterval interval, Long amountMinor) {
        Optional<PriceEntity> current = prices.findByPlanIdAndIntervalAndCurrencyAndActiveTrue(planId, interval, properties.currency());
        if (amountMinor == null || amountMinor < 0) {
            current.ifPresent(PriceEntity::retire);
            return;
        }
        if (current.isPresent() && current.get().getAmountMinor() == amountMinor) {
            return;
        }
        current.ifPresent(p -> {
            p.retire();
            prices.saveAndFlush(p);
        });
        prices.save(new PriceEntity(planId, interval, properties.currency(), amountMinor));
    }

    private PlanView view(PlanEntity p, List<PriceEntity> planPrices) {
        return new PlanView(p.getId(), p.getCode(), p.getName(), p.getDescription(), p.getSortOrder(), p.isActive(),
                p.isPublicPlan(), p.getTrialDays(),
                planPrices.stream().sorted(Comparator.comparing(PriceEntity::getInterval)).map(PlanCatalog::price).toList(),
                orderedEntitlements(cache.planEntitlements(p.getId())), p.getVersion());
    }

    static Map<String, String> orderedEntitlements(Map<String, String> values) {
        Map<String, String> ordered = new LinkedHashMap<>();
        for (EntitlementKey key : EntitlementKey.values()) {
            if (values.containsKey(key.key())) ordered.put(key.key(), values.get(key.key()));
        }
        return ordered;
    }

    static PriceView price(PriceEntity p) {
        return new PriceView(p.getId(), p.getInterval(), p.getCurrency(), p.getAmountMinor(), p.monthlyAmount());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

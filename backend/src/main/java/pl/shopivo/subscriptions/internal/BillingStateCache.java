package pl.shopivo.subscriptions.internal;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.subscriptions.SubscriptionStatus;

/**
 * Short-lived per-node cache of what a tenant is entitled to (subscription state, plan entitlements, overrides).
 * Read on hot paths (every write request, every storefront request), so it must not hit the database each time.
 * Changes made on this node invalidate the entry after commit; other nodes see them within {@link #TTL}.
 */
@Component
public class BillingStateCache {

    private static final Logger log = LoggerFactory.getLogger(BillingStateCache.class);
    static final Duration TTL = Duration.ofSeconds(30);

    public record TenantBillingState(boolean exists, SubscriptionStatus status, UUID planId, Instant trialEndsAt,
            Instant graceUntil, Map<String, String> planEntitlements, Map<String, String> overrides) {

        public boolean fullAccess(Instant now) {
            if (!exists) return true;
            return switch (status) {
                case TRIALING -> trialEndsAt == null || trialEndsAt.isAfter(now);
                case ACTIVE -> true;
                case PAST_DUE -> graceUntil == null || graceUntil.isAfter(now);
                case CANCELED, EXPIRED -> false;
            };
        }

        public Optional<String> value(String key) {
            String o = overrides.get(key);
            return Optional.ofNullable(o != null ? o : planEntitlements.get(key));
        }
    }

    private final Cache<UUID, TenantBillingState> cache = Caffeine.newBuilder().expireAfterWrite(TTL).maximumSize(50_000).build();
    private final Cache<UUID, Map<String, String>> planCache = Caffeine.newBuilder().expireAfterWrite(Duration.ofMinutes(5)).build();
    private final JdbcTemplate jdbc;
    private final TransactionTemplate readTx;

    BillingStateCache(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.readTx = new TransactionTemplate(tx.getTransactionManager());
        this.readTx.setReadOnly(true);
    }

    public TenantBillingState get(UUID tenantId) {
        return cache.get(tenantId, this::load);
    }

    public Map<String, String> planEntitlements(UUID planId) {
        return planCache.get(planId, id -> Map.copyOf(loadPlan(id)));
    }

    /** Drops the cached state once the current transaction commits (immediately when there is none). */
    public void invalidate(UUID tenantId) {
        cache.invalidate(tenantId);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cache.invalidate(tenantId);
                }
            });
        }
    }

    public void invalidatePlans() {
        planCache.invalidateAll();
        cache.invalidateAll();
    }

    private TenantBillingState load(UUID tenantId) {
        // RLS requires the tenant (or system) context on the connection. Bind it when we are not inside a
        // transaction; inside one, the caller's context must already match.
        boolean bound = TenantContext.isSystem() || TenantContext.tenantId().filter(tenantId::equals).isPresent();
        if (bound) {
            return query(tenantId);
        }
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Billing state of another tenant requested inside a transaction");
        }
        return TenantContext.callInTenant(tenantId, () -> readTx.execute(s -> query(tenantId)));
    }

    private TenantBillingState query(UUID tenantId) {
        var rows = jdbc.queryForList("""
                select status, plan_id, trial_ends_at, grace_until from subscriptions where tenant_id = ?
                """, tenantId);
        Map<String, String> overrides = new HashMap<>();
        jdbc.query("select key, value from entitlement_overrides where tenant_id = ? and (expires_at is null or expires_at > now())",
                rs -> {
                    overrides.put(rs.getString(1), rs.getString(2));
                }, tenantId);
        if (rows.isEmpty()) {
            log.warn("Tenant {} has no subscription record — treating as unrestricted", tenantId);
            return new TenantBillingState(false, null, null, null, null, Map.of(), Map.copyOf(overrides));
        }
        var row = rows.getFirst();
        UUID planId = (UUID) row.get("plan_id");
        return new TenantBillingState(true, SubscriptionStatus.valueOf((String) row.get("status")), planId,
                instant(row.get("trial_ends_at")), instant(row.get("grace_until")), planEntitlements(planId),
                Map.copyOf(overrides));
    }

    private Map<String, String> loadPlan(UUID planId) {
        Map<String, String> values = new HashMap<>();
        jdbc.query("select key, value from plan_entitlements where plan_id = ?",
                rs -> {
                    values.put(rs.getString(1), rs.getString(2));
                }, planId);
        return values;
    }

    private static Instant instant(Object value) {
        if (value instanceof Timestamp ts) return ts.toInstant();
        if (value instanceof java.time.OffsetDateTime odt) return odt.toInstant();
        return (Instant) value;
    }
}

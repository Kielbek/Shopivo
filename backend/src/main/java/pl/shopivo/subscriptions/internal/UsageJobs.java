package pl.shopivo.subscriptions.internal;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.subscriptions.EntitlementKey;

/** Flushes usage counters from Redis to PostgreSQL and flags tenants above their fair-use limits. */
@Component
public class UsageJobs {

    private static final Logger log = LoggerFactory.getLogger(UsageJobs.class);

    private final StringRedisTemplate redis;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final SubscriptionEngine engine;

    UsageJobs(StringRedisTemplate redis, JdbcTemplate jdbc, TransactionTemplate tx, SubscriptionEngine engine) {
        this.redis = redis;
        this.jdbc = jdbc;
        this.tx = tx;
        this.engine = engine;
    }

    /**
     * Atomically moves the pending hash aside (RENAME) and adds it to the database. If the database write fails the
     * hash stays under the "flushing" key and is retried first next time — counts are not lost or doubled.
     */
    @Scheduled(fixedDelayString = "${shopivo.billing.usage-flush-interval:PT5M}", initialDelayString = "PT2M")
    @SchedulerLock(name = "subscriptions.usage.flush", lockAtMostFor = "PT4M")
    public void flush() {
        try {
            if (!Boolean.TRUE.equals(redis.hasKey(RedisUsageRecorder.FLUSHING_KEY))) {
                if (!Boolean.TRUE.equals(redis.hasKey(RedisUsageRecorder.PENDING_KEY))) return;
                redis.rename(RedisUsageRecorder.PENDING_KEY, RedisUsageRecorder.FLUSHING_KEY);
            }
            List<RedisUsageRecorder.Counter> counters = new ArrayList<>();
            for (var e : redis.opsForHash().entries(RedisUsageRecorder.FLUSHING_KEY).entrySet()) {
                try {
                    counters.add(RedisUsageRecorder.Counter.parse(e));
                } catch (RuntimeException bad) {
                    log.warn("Skipping malformed usage counter {}", e.getKey());
                }
            }
            TenantContext.runAsSystem(() -> tx.executeWithoutResult(s -> {
                for (var c : counters) {
                    // Tenants deleted in the meantime are skipped by the existence check.
                    jdbc.update("""
                            insert into tenant_usage (tenant_id, metric, period, value)
                            select ?, ?, ?, ? where exists (select 1 from tenants where id = ?)
                            on conflict (tenant_id, metric, period) do update set value = tenant_usage.value + excluded.value
                            """, c.tenantId(), c.metric(), c.period(), c.value(), c.tenantId());
                }
            }));
            redis.delete(RedisUsageRecorder.FLUSHING_KEY);
        } catch (RuntimeException e) {
            log.warn("Usage flush failed (will retry): {}", e.getMessage());
        }
    }

    record Exceeded(UUID tenantId, String metric, long value, long limit) {
    }

    /** Soft limits: notify and flag, never block. */
    @Scheduled(cron = "${shopivo.billing.fair-use-cron:0 17 * * * *}")
    @SchedulerLock(name = "subscriptions.usage.fair-use", lockAtMostFor = "PT20M")
    public void checkFairUse() {
        LocalDate period = LocalDate.now(RedisUsageRecorder.ZONE).withDayOfMonth(1);
        List<Exceeded> exceeded = TenantContext.callAsSystem(() -> tx.execute(s -> findExceeded(period)));
        for (Exceeded e : exceeded) {
            try {
                TenantContext.runInTenant(e.tenantId(), () -> engine.recordFairUse(e.metric(), e.value(), e.limit(), period.toString()));
            } catch (RuntimeException ex) {
                log.error("Fair-use flag failed for tenant {}", e.tenantId(), ex);
            }
        }
    }

    List<Exceeded> findExceeded(LocalDate period) {
        List<Exceeded> result = new ArrayList<>();
        for (EntitlementKey key : EntitlementKey.values()) {
            if (key.kind() != EntitlementKey.Kind.FAIR_USE) continue;
            jdbc.query("""
                    select u.tenant_id, u.value, coalesce(o.value, pe.value) as lim
                    from tenant_usage u
                    join subscriptions s on s.tenant_id = u.tenant_id and s.status in ('TRIALING', 'ACTIVE', 'PAST_DUE')
                    left join plan_entitlements pe on pe.plan_id = s.plan_id and pe.key = ?
                    left join entitlement_overrides o on o.tenant_id = u.tenant_id and o.key = ?
                         and (o.expires_at is null or o.expires_at > now())
                    where u.period = ? and u.metric = ?
                    """, rs -> {
                String lim = rs.getString("lim");
                long limit = lim == null ? -1 : Long.parseLong(lim);
                long value = rs.getLong("value");
                if (limit >= 0 && value > limit) {
                    result.add(new Exceeded(rs.getObject("tenant_id", UUID.class), key.usageMetric(), value, limit));
                }
            }, key.key(), key.key(), period, key.usageMetric());
        }
        return result;
    }
}

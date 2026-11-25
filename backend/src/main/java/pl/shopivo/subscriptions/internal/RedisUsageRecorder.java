package pl.shopivo.subscriptions.internal;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.usage.UsageRecorder;

/**
 * Counts usage in Redis (one HINCRBY per event — cheap enough for every storefront request) and lets
 * {@link UsageJobs} flush the counters to {@code tenant_usage} periodically. Fail-open: metering must never break
 * the store; a Redis outage only loses some counts.
 */
@Component
class RedisUsageRecorder implements UsageRecorder {

    private static final Logger log = LoggerFactory.getLogger(RedisUsageRecorder.class);
    static final String PENDING_KEY = "usage:pending";
    static final String FLUSHING_KEY = "usage:flushing";
    static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");

    private final StringRedisTemplate redis;

    RedisUsageRecorder(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public void record(UUID tenantId, String metric, long delta) {
        try {
            redis.opsForHash().increment(PENDING_KEY, field(tenantId, metric, LocalDate.now(ZONE).withDayOfMonth(1)), delta);
        } catch (RuntimeException e) {
            log.debug("Usage metering unavailable: {}", e.getMessage());
        }
    }

    static String field(UUID tenantId, String metric, LocalDate period) {
        return tenantId + "|" + metric + "|" + period;
    }

    record Counter(UUID tenantId, String metric, LocalDate period, long value) {
        static Counter parse(Map.Entry<Object, Object> e) {
            String[] parts = e.getKey().toString().split("\\|");
            return new Counter(UUID.fromString(parts[0]), parts[1], LocalDate.parse(parts[2]), Long.parseLong(e.getValue().toString()));
        }
    }
}

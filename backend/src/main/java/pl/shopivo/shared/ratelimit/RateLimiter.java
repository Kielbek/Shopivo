package pl.shopivo.shared.ratelimit;

import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.error.RateLimitedException;

/**
 * Fixed-window rate limiter backed by Redis (atomic INCR + PEXPIRE via Lua). Shared by all replicas.
 * If Redis is unavailable the limiter fails open (availability over strictness) and logs a warning;
 * account lockout in the database remains effective for credential attacks.
 */
@Component
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);
    private static final RedisScript<List> SCRIPT = RedisScript.of("""
            local c = redis.call('INCR', KEYS[1])
            if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
            return {c, redis.call('PTTL', KEYS[1])}
            """, List.class);

    private final StringRedisTemplate redis;

    public RateLimiter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Consumes one permit for {@code key}; throws {@link RateLimitedException} when the limit is exceeded. */
    public void consume(String key, int limit, Duration window) {
        try {
            List<?> result = redis.execute(SCRIPT, List.of("rl:" + key), String.valueOf(window.toMillis()));
            if (result == null || result.size() < 2) {
                return;
            }
            long count = ((Number) result.get(0)).longValue();
            long ttl = ((Number) result.get(1)).longValue();
            if (count > limit) {
                throw new RateLimitedException(Duration.ofMillis(Math.max(ttl, 1000)));
            }
        } catch (RateLimitedException e) {
            throw e;
        } catch (RuntimeException e) {
            log.warn("Rate limiter unavailable, allowing request: {}", e.getMessage());
        }
    }

    public void reset(String key) {
        try {
            redis.delete("rl:" + key);
        } catch (RuntimeException e) {
            log.warn("Rate limiter reset failed: {}", e.getMessage());
        }
    }
}

package pl.shopivo.shared.cache;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class CachesTest {

    @Test
    void cachesValuesButNotNulls() {
        Cache<String, String> cache = Caffeine.newBuilder().build();
        AtomicInteger loads = new AtomicInteger();
        assertThat(Caches.get(cache, "a", k -> { loads.incrementAndGet(); return "A"; })).isEqualTo("A");
        assertThat(Caches.get(cache, "a", k -> { loads.incrementAndGet(); return "B"; })).isEqualTo("A");
        assertThat(loads).hasValue(1);
        assertThat(Caches.get(cache, "empty", k -> null)).isNull();
        assertThat(cache.getIfPresent("empty")).isNull();
    }

    /** A slow load (database, Redis) must not hold a lock that other requests for the same key wait on. */
    @Test
    void aSlowLoadDoesNotBlockOtherRequestsForTheSameKey() throws Exception {
        Cache<String, String> cache = Caffeine.newBuilder().build();
        CountDownLatch slowStarted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread slow = Thread.ofVirtual().start(() -> Caches.get(cache, "store", k -> {
            slowStarted.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return "slow";
        }));
        assertThat(slowStarted.await(5, TimeUnit.SECONDS)).isTrue();
        CountDownLatch fastDone = new CountDownLatch(1);
        Thread.ofVirtual().start(() -> {
            Caches.get(cache, "store", k -> "fast");
            fastDone.countDown();
        });
        assertThat(fastDone.await(5, TimeUnit.SECONDS)).as("second request finished while the first was still loading").isTrue();
        release.countDown();
        slow.join(5_000);
    }
}

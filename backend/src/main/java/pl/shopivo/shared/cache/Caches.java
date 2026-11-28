package pl.shopivo.shared.cache;

import com.github.benmanes.caffeine.cache.Cache;
import java.util.function.Function;

/**
 * Cache loads that may block (database, Redis, HTTP). {@code Cache.get(key, loader)} runs the loader inside the cache's
 * map lock; with virtual threads a blocked loader then pins its carrier thread, and concurrent requests for the same key
 * pin the rest. With only a few carriers the whole server stalls (seen with a storefront page firing many parallel
 * requests for one store). Here the loader runs outside any lock; two requests may load the same key at once, which
 * is harmless for these read-only lookups.
 */
public final class Caches {

    private Caches() {
    }

    /** The cached value, or the loader's result (cached unless null; null is returned as is). */
    public static <K, V> V get(Cache<K, V> cache, K key, Function<? super K, ? extends V> loader) {
        V hit = cache.getIfPresent(key);
        if (hit != null) return hit;
        V loaded = loader.apply(key);
        if (loaded != null) cache.put(key, loaded);
        return loaded;
    }
}

package pl.shopivo.subscriptions;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import pl.shopivo.shared.error.ApiException;
import pl.shopivo.subscriptions.internal.BillingStateCache;

/**
 * Plan limits and features of a tenant (plan entitlements with per-tenant overrides). Business modules call
 * {@link #checkLimit} / {@link #requireFeature} before creating resources; refusals are HTTP 402 with a stable code
 * the frontend turns into an upgrade prompt.
 */
@Service
public class Entitlements {

    public static final long UNLIMITED = -1;

    private final BillingStateCache state;

    Entitlements(BillingStateCache state) {
        this.state = state;
    }

    /** Numeric value; {@link #UNLIMITED} for no limit; 0 when the plan does not define the key. */
    public long limit(UUID tenantId, EntitlementKey key) {
        var s = state.get(tenantId);
        if (!s.exists()) return UNLIMITED;
        return s.value(key.key()).map(Entitlements::parse).orElse(0L);
    }

    public boolean feature(UUID tenantId, EntitlementKey key) {
        var s = state.get(tenantId);
        if (!s.exists()) return true;
        return s.value(key.key()).map("true"::equalsIgnoreCase).orElse(false);
    }

    /** @param current number of resources the tenant already has (the new one would be {@code current + 1}). */
    public void checkLimit(UUID tenantId, EntitlementKey key, long current) {
        long limit = limit(tenantId, key);
        if (limit != UNLIMITED && current >= limit) {
            throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "ENTITLEMENT_LIMIT",
                    "Osiągnięto limit planu: " + key.label() + " (" + limit + "). Zmień plan, aby dodać więcej.",
                    Map.of("entitlement", key.key(), "limit", limit));
        }
    }

    public void requireFeature(UUID tenantId, EntitlementKey key) {
        if (!feature(tenantId, key)) {
            throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "FEATURE_NOT_IN_PLAN",
                    "Funkcja „" + key.label() + "” nie jest dostępna w Twoim planie.", Map.of("entitlement", key.key()));
        }
    }

    /** Whether the store may be modified and served (false after the subscription expired or was canceled). */
    public boolean hasFullAccess(UUID tenantId) {
        return state.get(tenantId).fullAccess(Instant.now());
    }

    static long parse(String value) {
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}

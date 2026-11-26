package pl.shopivo.subscriptions.internal;

import java.util.UUID;
import org.springframework.stereotype.Component;
import pl.shopivo.catalog.ProductLimitPolicy;
import pl.shopivo.media.MediaQuotaPolicy;
import pl.shopivo.stores.StorefrontAvailabilityPolicy;
import pl.shopivo.subscriptions.EntitlementKey;
import pl.shopivo.subscriptions.Entitlements;
import pl.shopivo.tenants.TeamSizePolicy;
import pl.shopivo.tenants.TenantWriteAccessPolicy;

/** Enforces the subscription in other modules through their extension points. */
@Component
class PlanPolicies implements TeamSizePolicy, TenantWriteAccessPolicy, StorefrontAvailabilityPolicy, ProductLimitPolicy,
        MediaQuotaPolicy {

    private final Entitlements entitlements;

    PlanPolicies(Entitlements entitlements) {
        this.entitlements = entitlements;
    }

    @Override
    public void checkCanAddMember(UUID tenantId, long currentSize) {
        entitlements.checkLimit(tenantId, EntitlementKey.STAFF_MAX, currentSize);
    }

    @Override
    public void checkCanAddProduct(UUID tenantId, long currentCount) {
        entitlements.checkLimit(tenantId, EntitlementKey.PRODUCTS_MAX, currentCount);
    }

    @Override
    public void checkCanStore(UUID tenantId, long usedBytes, long newBytes) {
        long limitMb = entitlements.limit(tenantId, EntitlementKey.STORAGE_MAX_MB);
        if (limitMb != Entitlements.UNLIMITED && usedBytes + newBytes > limitMb * 1024 * 1024) {
            throw new pl.shopivo.shared.error.ApiException(org.springframework.http.HttpStatus.PAYMENT_REQUIRED, "ENTITLEMENT_LIMIT",
                    "Brak miejsca na pliki w Twoim planie (" + limitMb + " MB). Usuń nieużywane zdjęcia lub zmień plan.",
                    java.util.Map.of("entitlement", EntitlementKey.STORAGE_MAX_MB.key(), "limit", limitMb));
        }
    }

    @Override
    public boolean canWrite(UUID tenantId) {
        return entitlements.hasFullAccess(tenantId);
    }

    /**
     * Fair-use limits never take the storefront down — customers of a busy store must still be able to buy.
     * Only an expired/canceled subscription does.
     */
    @Override
    public boolean isAvailable(UUID tenantId) {
        return entitlements.hasFullAccess(tenantId);
    }
}

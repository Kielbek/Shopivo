package pl.shopivo.subscriptions.internal;

import java.util.UUID;
import org.springframework.stereotype.Component;
import pl.shopivo.stores.StorefrontAvailabilityPolicy;
import pl.shopivo.subscriptions.EntitlementKey;
import pl.shopivo.subscriptions.Entitlements;
import pl.shopivo.tenants.TeamSizePolicy;
import pl.shopivo.tenants.TenantWriteAccessPolicy;

/** Enforces the subscription in other modules through their extension points. */
@Component
class PlanPolicies implements TeamSizePolicy, TenantWriteAccessPolicy, StorefrontAvailabilityPolicy {

    private final Entitlements entitlements;

    PlanPolicies(Entitlements entitlements) {
        this.entitlements = entitlements;
    }

    @Override
    public void checkCanAddMember(UUID tenantId, long currentSize) {
        entitlements.checkLimit(tenantId, EntitlementKey.STAFF_MAX, currentSize);
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

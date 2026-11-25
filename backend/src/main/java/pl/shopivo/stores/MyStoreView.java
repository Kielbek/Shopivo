package pl.shopivo.stores;

import java.util.Set;
import java.util.UUID;
import pl.shopivo.tenants.StorePermission;
import pl.shopivo.tenants.StoreRole;
import pl.shopivo.tenants.TenantStatus;

/** A store as seen by one of its team members. */
public record MyStoreView(
        UUID tenantId,
        String name,
        String slug,
        StoreStatus status,
        TenantStatus tenantStatus,
        String primaryHostname,
        StoreRole role,
        Set<StorePermission> permissions) {
}

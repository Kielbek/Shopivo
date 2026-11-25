package pl.shopivo.tenants;

import java.util.UUID;

/** A tenant the current user belongs to, with their role. */
public record UserTenantView(UUID tenantId, String tenantName, TenantStatus tenantStatus, StoreRole role) {
}

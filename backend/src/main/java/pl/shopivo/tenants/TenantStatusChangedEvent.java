package pl.shopivo.tenants;

import java.util.UUID;

public record TenantStatusChangedEvent(UUID tenantId, TenantStatus newStatus) {
}

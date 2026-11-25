package pl.shopivo.tenants;

import java.time.Instant;
import java.util.UUID;

public record TenantView(UUID id, String name, TenantStatus status, String suspendedReason, UUID createdBy, Instant createdAt) {
}

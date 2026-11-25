package pl.shopivo.tenants;

import java.time.Instant;
import java.util.UUID;

public record MembershipView(UUID id, UUID tenantId, UUID userId, StoreRole role, MembershipStatus status, Instant createdAt) {
}

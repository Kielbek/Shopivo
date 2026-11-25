package pl.shopivo.audit;

import java.time.Instant;
import java.util.UUID;

public record AuditLogView(
        UUID id,
        UUID tenantId,
        UUID actorUserId,
        String actorType,
        String action,
        String targetType,
        String targetId,
        String ipAddress,
        String metadata,
        Instant createdAt) {
}

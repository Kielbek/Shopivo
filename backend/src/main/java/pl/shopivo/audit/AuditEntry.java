package pl.shopivo.audit;

import java.util.Map;
import java.util.UUID;

/**
 * An auditable action. {@code metadata} must never contain secrets or personal data beyond identifiers.
 *
 * @param tenantId {@code null} for platform-level events (login, registration, admin actions on users)
 */
public record AuditEntry(String action, UUID tenantId, String targetType, String targetId, Map<String, Object> metadata) {

    public static AuditEntry platform(String action, String targetType, Object targetId) {
        return new AuditEntry(action, null, targetType, str(targetId), Map.of());
    }

    public static AuditEntry tenant(String action, UUID tenantId, String targetType, Object targetId) {
        return new AuditEntry(action, tenantId, targetType, str(targetId), Map.of());
    }

    public AuditEntry with(Map<String, Object> extra) {
        return new AuditEntry(action, tenantId, targetType, targetId, extra);
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}

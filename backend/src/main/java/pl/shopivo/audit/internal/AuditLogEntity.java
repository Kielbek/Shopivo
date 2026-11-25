package pl.shopivo.audit.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.ColumnTransformer;
import pl.shopivo.audit.AuditLogView;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "audit_logs")
public class AuditLogEntity extends BaseEntity {

    @Column(name = "tenant_id", updatable = false)
    private UUID tenantId;
    @Column(name = "actor_user_id", updatable = false)
    private UUID actorUserId;
    @Column(name = "actor_type", nullable = false, updatable = false)
    private String actorType;
    @Column(nullable = false, updatable = false)
    private String action;
    @Column(name = "target_type", updatable = false)
    private String targetType;
    @Column(name = "target_id", updatable = false)
    private String targetId;
    @Column(name = "ip_address", updatable = false)
    private String ipAddress;
    @Column(nullable = false, updatable = false, columnDefinition = "jsonb")
    @ColumnTransformer(write = "?::jsonb")
    private String metadata;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected AuditLogEntity() {
    }

    public AuditLogEntity(UUID tenantId, UUID actorUserId, String actorType, String action, String targetType,
            String targetId, String ipAddress, String metadata) {
        this.tenantId = tenantId;
        this.actorUserId = actorUserId;
        this.actorType = actorType;
        this.action = action;
        this.targetType = targetType;
        this.targetId = targetId;
        this.ipAddress = ipAddress;
        this.metadata = metadata;
        this.createdAt = Instant.now();
    }

    public AuditLogView toView() {
        return new AuditLogView(getId(), tenantId, actorUserId, actorType, action, targetType, targetId,
                ipAddress, metadata, createdAt);
    }
}

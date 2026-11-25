package pl.shopivo.subscriptions.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.TenantId;
import pl.shopivo.shared.persistence.BaseEntity;

/** Append-only history of the subscription (shown to the merchant and the administrator). */
@Entity
@Table(name = "subscription_events")
public class SubscriptionEventEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
    @Column(name = "subscription_id", nullable = false, updatable = false)
    private UUID subscriptionId;
    @Column(nullable = false, updatable = false)
    private String type;
    @Column(name = "from_status", updatable = false)
    private String fromStatus;
    @Column(name = "to_status", updatable = false)
    private String toStatus;
    @Column(name = "plan_code", updatable = false)
    private String planCode;
    @Column(updatable = false)
    private String detail;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected SubscriptionEventEntity() {
    }

    public SubscriptionEventEntity(UUID subscriptionId, String type, String fromStatus, String toStatus, String planCode,
            String detail) {
        this.subscriptionId = subscriptionId;
        this.type = type;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.planCode = planCode;
        this.detail = detail;
    }

    public String getType() { return type; }
    public String getFromStatus() { return fromStatus; }
    public String getToStatus() { return toStatus; }
    public String getPlanCode() { return planCode; }
    public String getDetail() { return detail; }
    public Instant getCreatedAt() { return createdAt; }
}

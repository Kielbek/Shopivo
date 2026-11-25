package pl.shopivo.billing.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "webhook_events")
public class WebhookEventEntity extends BaseEntity {

    @Column(nullable = false, updatable = false)
    private String provider;
    @Column(name = "event_id", nullable = false, updatable = false)
    private String eventId;
    @Column(nullable = false, updatable = false)
    private String type;
    @Column(nullable = false)
    private String status;
    @Column(nullable = false)
    private int attempts;
    @Column(name = "last_error")
    private String lastError;
    @Column(nullable = false, updatable = false)
    private String payload;
    @Column(name = "received_at", nullable = false, updatable = false)
    private Instant receivedAt;
    @Column(name = "processed_at")
    private Instant processedAt;

    protected WebhookEventEntity() {
    }

    public WebhookEventEntity(String provider, String eventId, String type, String payload) {
        this.provider = provider;
        this.eventId = eventId;
        this.type = type;
        this.payload = payload;
        this.status = "RECEIVED";
        this.receivedAt = Instant.now();
    }

    public String getStatus() {
        return status;
    }

    public String getProvider() {
        return provider;
    }

    public String getPayload() {
        return payload;
    }

    public int getAttempts() {
        return attempts;
    }

    public void processed() {
        status = "PROCESSED";
        attempts++;
        processedAt = Instant.now();
        lastError = null;
    }

    public void failed(String error) {
        status = "FAILED";
        attempts++;
        lastError = error == null ? null : error.substring(0, Math.min(500, error.length()));
    }
}

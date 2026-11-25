package pl.shopivo.subscriptions.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import pl.shopivo.shared.persistence.BaseEntity;

@Entity
@Table(name = "subscription_plans")
public class PlanEntity extends BaseEntity {

    @Column(nullable = false, updatable = false)
    private String code;
    @Column(nullable = false)
    private String name;
    private String description;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
    @Column(nullable = false)
    private boolean active = true;
    @Column(name = "public", nullable = false)
    private boolean publicPlan = true;
    @Column(name = "trial_days", nullable = false)
    private int trialDays;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
    @Version
    private long version;

    protected PlanEntity() {
    }

    public PlanEntity(String code) {
        this.code = code;
    }

    PlanEntity(UUID id, String code) {
        super(id);
        this.code = code;
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public void update(String name, String description, int sortOrder, boolean active, boolean publicPlan, int trialDays) {
        this.name = name;
        this.description = description;
        this.sortOrder = sortOrder;
        this.active = active;
        this.publicPlan = publicPlan;
        this.trialDays = trialDays;
    }

    public String getCode() { return code; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public int getSortOrder() { return sortOrder; }
    public boolean isActive() { return active; }
    public boolean isPublicPlan() { return publicPlan; }
    public int getTrialDays() { return trialDays; }
    public long getVersion() { return version; }
}

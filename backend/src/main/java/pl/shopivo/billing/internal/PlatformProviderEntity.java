package pl.shopivo.billing.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "platform_payment_providers")
public class PlatformProviderEntity {

    @Id
    private String provider;
    @Column(nullable = false)
    private boolean enabled;
    @Column(nullable = false)
    private boolean sandbox = true;
    @Column(name = "credentials_encrypted")
    private String credentialsEncrypted;
    @Column(name = "active_for_billing", nullable = false)
    private boolean activeForBilling;
    @Column(name = "last_test_at")
    private Instant lastTestAt;
    @Column(name = "last_test_ok")
    private Boolean lastTestOk;
    @Column(name = "updated_by")
    private UUID updatedBy;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
    @Version
    private long version;

    protected PlatformProviderEntity() {
    }

    public PlatformProviderEntity(String provider) {
        this.provider = provider;
    }

    public void configure(boolean enabled, boolean sandbox, String credentialsEncrypted, UUID actor) {
        this.enabled = enabled;
        this.sandbox = sandbox;
        this.credentialsEncrypted = credentialsEncrypted;
        this.updatedBy = actor;
        this.updatedAt = Instant.now();
        this.lastTestAt = null;
        this.lastTestOk = null;
    }

    public void activate() {
        this.activeForBilling = true;
    }

    public void deactivate() {
        this.activeForBilling = false;
    }

    public void recordTest(boolean ok) {
        this.lastTestAt = Instant.now();
        this.lastTestOk = ok;
    }

    public String getProvider() {
        return provider;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean isSandbox() {
        return sandbox;
    }

    public boolean isActiveForBilling() {
        return activeForBilling;
    }

    public String getCredentialsEncrypted() {
        return credentialsEncrypted;
    }

    public Instant getLastTestAt() {
        return lastTestAt;
    }

    public Boolean getLastTestOk() {
        return lastTestOk;
    }
}

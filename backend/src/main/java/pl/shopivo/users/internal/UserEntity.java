package pl.shopivo.users.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Duration;
import java.time.Instant;
import pl.shopivo.shared.persistence.BaseEntity;
import pl.shopivo.users.PlatformRole;
import pl.shopivo.users.UserCredentials;
import pl.shopivo.users.UserStatus;
import pl.shopivo.users.UserView;

@Entity
@Table(name = "users")
public class UserEntity extends BaseEntity {

    @Column(nullable = false, columnDefinition = "citext")
    private String email;
    @Column(name = "password_hash")
    private String passwordHash;
    @Column(name = "first_name", nullable = false)
    private String firstName;
    @Column(name = "last_name", nullable = false)
    private String lastName;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status;
    @Enumerated(EnumType.STRING)
    @Column(name = "platform_role")
    private PlatformRole platformRole;
    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;
    @Column(nullable = false)
    private String locale = "pl-PL";
    @Column(name = "failed_login_count", nullable = false)
    private int failedLoginCount;
    @Column(name = "locked_until")
    private Instant lockedUntil;
    @Column(name = "mfa_enabled", nullable = false)
    private boolean mfaEnabled;
    @Column(name = "last_login_at")
    private Instant lastLoginAt;
    @Column(name = "terms_accepted_at")
    private Instant termsAcceptedAt;
    @Column(name = "terms_version")
    private String termsVersion;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Version
    private long version;

    protected UserEntity() {
    }

    public UserEntity(String email, String firstName, String lastName, String passwordHash) {
        this.email = email;
        this.firstName = firstName;
        this.lastName = lastName;
        this.passwordHash = passwordHash;
        this.status = UserStatus.PENDING_VERIFICATION;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }

    public void markEmailVerified(Instant now) {
        if (emailVerifiedAt == null) {
            emailVerifiedAt = now;
        }
        if (status == UserStatus.PENDING_VERIFICATION) {
            status = UserStatus.ACTIVE;
        }
    }

    public void changePasswordHash(String hash) {
        this.passwordHash = hash;
        this.failedLoginCount = 0;
        this.lockedUntil = null;
    }

    public void recordFailedLogin(Instant now, int maxAttempts, Duration lockDuration) {
        failedLoginCount++;
        if (failedLoginCount >= maxAttempts) {
            // Escalating lock: doubles for every further block of failures, capped at 24h.
            int blocks = failedLoginCount / maxAttempts;
            long minutes = Math.min(lockDuration.toMinutes() * (1L << Math.min(blocks - 1, 6)), 24 * 60);
            lockedUntil = now.plus(Duration.ofMinutes(minutes));
        }
    }

    public void recordSuccessfulLogin(Instant now) {
        failedLoginCount = 0;
        lockedUntil = null;
        lastLoginAt = now;
    }

    public void acceptTerms(String version, Instant now) {
        this.termsVersion = version;
        this.termsAcceptedAt = now;
    }

    /** Removes the local password (e.g. after an OAuth link proved mailbox ownership on an unverified account). */
    public void clearPassword() {
        this.passwordHash = null;
    }

    public void setMfaEnabled(boolean enabled) {
        this.mfaEnabled = enabled;
    }

    public void updateProfile(String firstName, String lastName, String locale) {
        this.firstName = firstName;
        this.lastName = lastName;
        if (locale != null && !locale.isBlank()) {
            this.locale = locale;
        }
    }

    public void setPlatformRole(PlatformRole role) {
        this.platformRole = role;
    }

    public void changeStatus(UserStatus newStatus) {
        this.status = newStatus;
    }

    public UserView toView() {
        return new UserView(getId(), email, firstName, lastName, status, platformRole, emailVerifiedAt != null,
                locale, mfaEnabled, lastLoginAt, createdAt);
    }

    public UserCredentials toCredentials() {
        return new UserCredentials(getId(), email, passwordHash, status, platformRole, emailVerifiedAt != null,
                failedLoginCount, lockedUntil, mfaEnabled);
    }
}

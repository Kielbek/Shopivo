package pl.shopivo.users;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.users.internal.UserEntity;
import pl.shopivo.users.internal.UserRepository;

/** Public API of the users module. */
@Service
@Transactional
public class UserAccounts {

    private final UserRepository users;
    private final ApplicationEventPublisher events;

    UserAccounts(UserRepository users, ApplicationEventPublisher events) {
        this.users = users;
        this.events = events;
    }

    public static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    @Transactional(readOnly = true)
    public Optional<UserView> findById(UUID id) {
        return users.findById(id).map(UserEntity::toView);
    }

    @Transactional(readOnly = true)
    public UserView getById(UUID id) {
        return findById(id).orElseThrow(NotFoundException::new);
    }

    @Transactional(readOnly = true)
    public Optional<UserView> findByEmail(String email) {
        return users.findByEmail(normalizeEmail(email)).map(UserEntity::toView);
    }

    @Transactional(readOnly = true)
    public Optional<UserCredentials> credentialsByEmail(String email) {
        return users.findByEmail(normalizeEmail(email)).map(UserEntity::toCredentials);
    }

    @Transactional(readOnly = true)
    public UserCredentials credentialsById(UUID id) {
        return users.findById(id).map(UserEntity::toCredentials).orElseThrow(NotFoundException::new);
    }

    public UserView register(String email, String firstName, String lastName, String passwordHash,
            boolean emailVerified, String termsVersion) {
        String normalized = normalizeEmail(email);
        if (users.existsByEmail(normalized)) {
            throw new ConflictException("EMAIL_TAKEN", "Konto z tym adresem e-mail już istnieje.");
        }
        UserEntity user = new UserEntity(normalized, firstName.trim(), lastName.trim(), passwordHash);
        if (emailVerified) {
            user.markEmailVerified(Instant.now());
        }
        if (termsVersion != null) {
            user.acceptTerms(termsVersion, Instant.now());
        }
        return users.save(user).toView();
    }

    public void markEmailVerified(UUID id) {
        load(id).markEmailVerified(Instant.now());
    }

    /**
     * Called when an external identity provider proved ownership of the mailbox. If the local account was never
     * verified, its password is discarded — it may have been set by someone else (account pre-hijacking).
     */
    public void confirmMailboxOwnershipViaProvider(UUID id) {
        UserEntity user = load(id);
        if (!user.toView().emailVerified()) {
            user.clearPassword();
        }
        user.markEmailVerified(Instant.now());
    }

    public void changePasswordHash(UUID id, String passwordHash) {
        load(id).changePasswordHash(passwordHash);
    }

    public void recordFailedLogin(UUID id, int maxAttempts, Duration lockDuration) {
        load(id).recordFailedLogin(Instant.now(), maxAttempts, lockDuration);
    }

    public void recordSuccessfulLogin(UUID id) {
        load(id).recordSuccessfulLogin(Instant.now());
    }

    public void setMfaEnabled(UUID id, boolean enabled) {
        load(id).setMfaEnabled(enabled);
    }

    public UserView updateProfile(UUID id, String firstName, String lastName, String locale) {
        UserEntity user = load(id);
        user.updateProfile(firstName.trim(), lastName.trim(), locale);
        return user.toView();
    }

    public void grantPlatformRole(UUID id, PlatformRole role) {
        load(id).setPlatformRole(role);
    }

    public UserView changeStatus(UUID id, UserStatus status) {
        UserEntity user = load(id);
        user.changeStatus(status);
        events.publishEvent(new UserStatusChangedEvent(id, status));
        return user.toView();
    }

    @Transactional(readOnly = true)
    public Page<UserView> search(String query, Pageable pageable) {
        if (query == null || query.isBlank()) {
            return users.findAllByOrderByCreatedAtDesc(pageable).map(UserEntity::toView);
        }
        String q = query.trim().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "");
        return users.search(q, pageable).map(UserEntity::toView);
    }

    @Transactional(readOnly = true)
    public long count() {
        return users.count();
    }

    @Transactional(readOnly = true)
    public long countCreatedSince(Instant since) {
        return users.countByCreatedAtAfter(since);
    }

    /** New accounts per local day (Europe/Warsaw) since {@code since}; days without registrations are absent. */
    @Transactional(readOnly = true)
    public java.util.Map<java.time.LocalDate, Long> registrationsPerDay(Instant since) {
        return toDailyMap(users.countPerDaySince(since));
    }

    static java.util.Map<java.time.LocalDate, Long> toDailyMap(java.util.List<Object[]> rows) {
        java.util.Map<java.time.LocalDate, Long> result = new java.util.TreeMap<>();
        for (Object[] row : rows) {
            java.time.LocalDate day = row[0] instanceof java.sql.Date d ? d.toLocalDate() : (java.time.LocalDate) row[0];
            result.put(day, ((Number) row[1]).longValue());
        }
        return result;
    }

    @Transactional(readOnly = true)
    public boolean anyPlatformAdminExists() {
        return users.existsByPlatformRole(PlatformRole.PLATFORM_ADMIN);
    }

    private UserEntity load(UUID id) {
        return users.findById(id).orElseThrow(NotFoundException::new);
    }
}

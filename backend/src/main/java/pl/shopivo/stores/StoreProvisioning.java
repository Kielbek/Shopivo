package pl.shopivo.stores;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.domains.StoreDomains;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.security.CurrentUser;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.internal.StoreEntity;
import pl.shopivo.stores.internal.StoreRepository;
import pl.shopivo.stores.internal.StoreSettingsEntity;
import pl.shopivo.stores.internal.StoreSettingsRepository;
import pl.shopivo.tenants.TenantMemberships;

/**
 * Creates a new store as a pure application-level operation: tenant + owner membership + store + settings +
 * platform subdomain in a single transaction. No infrastructure is provisioned per store.
 */
@Service
public class StoreProvisioning {

    private final StoreRepository stores;
    private final StoreSettingsRepository settings;
    private final TenantMemberships memberships;
    private final StoreDomains domains;
    private final AuditLog auditLog;
    private final TransactionTemplate tx;
    private final ShopivoProperties properties;
    private final org.springframework.context.ApplicationEventPublisher events;

    StoreProvisioning(StoreRepository stores, StoreSettingsRepository settings, TenantMemberships memberships,
            StoreDomains domains, AuditLog auditLog, TransactionTemplate tx, ShopivoProperties properties,
            org.springframework.context.ApplicationEventPublisher events) {
        this.events = events;
        this.stores = stores;
        this.settings = settings;
        this.memberships = memberships;
        this.domains = domains;
        this.auditLog = auditLog;
        this.tx = tx;
        this.properties = properties;
    }

    public record SlugAvailability(String slug, boolean available, String reason) {
    }

    public SlugAvailability checkSlug(String rawSlug) {
        String slug = rawSlug == null ? "" : rawSlug.trim().toLowerCase(Locale.ROOT);
        if (StoreDomains.RESERVED_LABELS.contains(slug)) {
            return new SlugAvailability(slug, false, "RESERVED");
        }
        if (!StoreDomains.isValidSubdomainLabel(slug)) {
            return new SlugAvailability(slug, false, "INVALID");
        }
        boolean taken = TenantContext.callAsSystem(() -> tx.execute(s -> stores.existsBySlug(slug)));
        return new SlugAvailability(slug, !taken, taken ? "TAKEN" : null);
    }

    public StoreView createStore(CurrentUser user, String name, String rawSlug) {
        return createStore(user, name, rawSlug, null);
    }

    public StoreView createStore(CurrentUser user, String name, String rawSlug, StoreIndustry industry) {
        SlugAvailability availability = checkSlug(rawSlug);
        if (!availability.available()) {
            if ("TAKEN".equals(availability.reason())) {
                throw new ConflictException("SLUG_TAKEN", "Ten adres sklepu jest już zajęty.");
            }
            throw new BusinessRuleException("INVALID_SLUG",
                    "Adres sklepu może zawierać 3–40 znaków: małe litery, cyfry i myślniki (nie na początku i końcu).");
        }
        int limit = properties.tenancy().maxStoresPerUser();
        if (memberships.countOwnedTenants(user.id()) >= limit) {
            throw new BusinessRuleException("STORE_LIMIT_REACHED",
                    "Osiągnięto maksymalną liczbę sklepów na jednym koncie (" + limit + ").");
        }
        String slug = availability.slug();
        String storeName = name.trim();
        UUID tenantId = UuidV7.generate();
        try {
            return TenantContext.callInTenant(tenantId, () -> tx.execute(status -> {
                memberships.createTenantWithOwner(tenantId, storeName, user.id());
                StoreEntity entity = new StoreEntity(storeName, slug, user.email());
                entity.setIndustry(industry);
                StoreEntity store = stores.save(entity);
                settings.save(new StoreSettingsEntity());
                var domain = domains.createPlatformSubdomain(slug);
                stores.flush();
                auditLog.record(AuditEntry.tenant("store.created", tenantId, "store", store.getId())
                        .with(Map.of("slug", slug)));
                events.publishEvent(new StoreCreatedEvent(tenantId, store.getId(), user.id()));
                return store.toView(domain.hostname());
            }));
        } catch (DataIntegrityViolationException e) {
            // Concurrent creation with the same slug — the unique constraint is the final arbiter.
            throw new ConflictException("SLUG_TAKEN", "Ten adres sklepu jest już zajęty.");
        }
    }
}

package pl.shopivo.stores;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.Collection;
import java.util.Currency;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.domains.StoreDomains;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.internal.StoreEntity;
import pl.shopivo.stores.internal.StoreRepository;
import pl.shopivo.stores.internal.StoreSettingsEntity;
import pl.shopivo.stores.internal.StoreSettingsRepository;
import pl.shopivo.tenants.TenantMemberships;
import pl.shopivo.tenants.UserTenantView;

/** Public API: store configuration of the current tenant and cross-store listings for a user. */
@Service
@Transactional
public class Stores {

    public static final Set<String> SUPPORTED_LOCALES = Set.of("pl-PL", "en-US", "de-DE");

    private final StoreRepository stores;
    private final StoreSettingsRepository settings;
    private final StoreDomains domains;
    private final TenantMemberships memberships;
    private final AuditLog auditLog;
    private final java.util.List<CurrencyChangeGuard> currencyGuards;
    private final java.util.List<StorePublishCheck> publishChecks;

    Stores(StoreRepository stores, StoreSettingsRepository settings, StoreDomains domains,
            TenantMemberships memberships, AuditLog auditLog, java.util.List<CurrencyChangeGuard> currencyGuards,
            java.util.List<StorePublishCheck> publishChecks) {
        this.currencyGuards = currencyGuards;
        this.publishChecks = publishChecks;
        this.stores = stores;
        this.settings = settings;
        this.domains = domains;
        this.memberships = memberships;
        this.auditLog = auditLog;
    }

    public record StoreUpdate(String name, String contactEmail, String defaultLocale, String defaultCurrency,
            String timezone, long version) {
    }

    /** What blocks publishing: seller identification required by law (company, NIP, address) and the other modules' checks. */
    @Transactional(readOnly = true)
    public java.util.List<String> publishReadiness() {
        java.util.List<String> missing = new java.util.ArrayList<>();
        StoreSettingsView s = currentSettings();
        if (s.legalCompanyName() == null || s.taxId() == null || s.addressLine1() == null || s.postalCode() == null || s.city() == null) {
            missing.add("Uzupełnij dane firmy (nazwa, NIP, adres) — sklep musi wskazywać sprzedawcę");
        }
        StoreView store = current();
        if (store.contactEmail() == null && s.orderEmail() == null) {
            missing.add("Podaj e-mail kontaktowy sklepu");
        }
        publishChecks.forEach(c -> missing.addAll(c.missingForPublish()));
        return missing;
    }

    @Transactional
    public StoreView publish() {
        java.util.List<String> missing = publishReadiness();
        if (!missing.isEmpty()) {
            throw new BusinessRuleException("PUBLISH_NOT_READY", "Sklep nie jest jeszcze gotowy do publikacji.",
                    java.util.Map.of("missing", missing));
        }
        StoreEntity store = loadCurrent();
        store.publish();
        auditLog.record(AuditEntry.tenant("store.published", store.getTenantId(), "store", store.getId()));
        stores.flush();
        return store.toView(primaryHostname(store));
    }

    @Transactional
    public StoreView unpublish() {
        StoreEntity store = loadCurrent();
        store.unpublish();
        auditLog.record(AuditEntry.tenant("store.unpublished", store.getTenantId(), "store", store.getId()));
        stores.flush();
        return store.toView(primaryHostname(store));
    }

    @Transactional(readOnly = true)
    public StoreView current() {
        StoreEntity store = loadCurrent();
        return store.toView(primaryHostname(store));
    }

    public StoreView update(StoreUpdate update) {
        StoreEntity store = loadCurrent();
        if (store.getVersion() != update.version()) {
            throw new ConflictException("CONCURRENT_MODIFICATION",
                    "Dane sklepu zostały w międzyczasie zmienione. Odśwież stronę i spróbuj ponownie.");
        }
        if (!SUPPORTED_LOCALES.contains(update.defaultLocale())) {
            throw new BusinessRuleException("UNSUPPORTED_LOCALE", "Nieobsługiwany język sklepu.");
        }
        validateCurrency(update.defaultCurrency());
        validateTimezone(update.timezone());
        if (!update.defaultCurrency().equals(store.getDefaultCurrency())) {
            for (CurrencyChangeGuard guard : currencyGuards) {
                String reason = guard.blockingReason();
                if (reason != null) {
                    throw new BusinessRuleException("CURRENCY_LOCKED", "Nie można zmienić waluty — " + reason + ".");
                }
            }
        }
        String name = update.name().trim();
        store.update(name, blankToNull(update.contactEmail()), update.defaultLocale(), update.defaultCurrency(), update.timezone());
        memberships.renameCurrentTenant(name);
        auditLog.record(AuditEntry.tenant("store.updated", store.getTenantId(), "store", store.getId()));
        stores.flush();
        return store.toView(primaryHostname(store));
    }

    /** Sets the store's industries, primary first (only steers suggestions in the panel). */
    public StoreView setIndustries(java.util.List<StoreIndustry> industries) {
        StoreEntity store = loadCurrent();
        store.setIndustries(industries);
        auditLog.record(AuditEntry.tenant("store.industry.updated", store.getTenantId(), "store", store.getId())
                .with(java.util.Map.of("industries", String.join(",", industries.stream().map(Enum::name).toList()))));
        stores.flush();
        return store.toView(primaryHostname(store));
    }

    @Transactional(readOnly = true)
    public StoreSettingsView currentSettings() {
        return settings.findFirstBy().map(StoreSettingsEntity::toView).orElseThrow(NotFoundException::new);
    }

    public StoreSettingsView updateSettings(StoreSettingsView update) {
        StoreSettingsEntity entity = settings.findFirstBy().orElseThrow(NotFoundException::new);
        if (entity.getVersion() != update.version()) {
            throw new ConflictException("CONCURRENT_MODIFICATION",
                    "Ustawienia zostały w międzyczasie zmienione. Odśwież stronę i spróbuj ponownie.");
        }
        String nip = blankToNull(update.taxId());
        if (nip != null) {
            if ("PL".equals(update.countryCode()) && !TaxIds.isValidNip(nip)) {
                throw new BusinessRuleException("INVALID_TAX_ID", "Nieprawidłowy numer NIP.");
            }
            nip = "PL".equals(update.countryCode()) ? TaxIds.normalizeNip(nip) : nip.trim();
        }
        String postal = blankToNull(update.postalCode());
        if (postal != null && "PL".equals(update.countryCode()) && !postal.matches("\\d{2}-\\d{3}")) {
            throw new BusinessRuleException("INVALID_POSTAL_CODE", "Kod pocztowy musi mieć format 00-000.");
        }
        entity.update(new StoreSettingsView(blankToNull(update.legalCompanyName()), nip,
                blankToNull(update.addressLine1()), blankToNull(update.addressLine2()), postal,
                blankToNull(update.city()), update.countryCode(), blankToNull(update.phone()),
                blankToNull(update.orderEmail()), update.pricesIncludeTax(), update.version()));
        auditLog.record(AuditEntry.tenant("store.settings.updated", TenantContext.requireTenantId(), "store_settings", null));
        settings.flush();
        return entity.toView();
    }

    /** Stores the given user is a member of. Cross-tenant read restricted to tenant ids from verified memberships. */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public List<MyStoreView> storesOfUser(UUID userId) {
        List<UserTenantView> tenants = memberships.tenantsOfUser(userId);
        List<UUID> ids = tenants.stream().map(UserTenantView::tenantId).toList();
        Map<UUID, StoreEntity> byTenant = loadByTenantIds(ids);
        Map<UUID, String> hosts = domains.primaryHostnames(ids);
        return tenants.stream()
                .filter(t -> byTenant.containsKey(t.tenantId()))
                .map(t -> {
                    StoreEntity s = byTenant.get(t.tenantId());
                    return new MyStoreView(t.tenantId(), s.getName(), s.getSlug(), s.getStatus(), t.tenantStatus(),
                            hosts.get(t.tenantId()), t.role(), t.role().permissions());
                })
                .toList();
    }

    /** Store summaries for platform administration. Caller must already run in system context. */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Map<UUID, StoreView> byTenantIds(Collection<UUID> tenantIds) {
        if (!TenantContext.isSystem()) {
            throw new IllegalStateException("Cross-tenant store lookup requires system context");
        }
        Map<UUID, String> hosts = domains.primaryHostnames(tenantIds);
        return stores.findByTenantIdIn(tenantIds).stream()
                .collect(Collectors.toMap(StoreEntity::getTenantId, s -> s.toView(hosts.get(s.getTenantId()))));
    }

    private Map<UUID, StoreEntity> loadByTenantIds(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return TenantContext.callAsSystem(() -> stores.findByTenantIdIn(ids)).stream()
                .collect(Collectors.toMap(StoreEntity::getTenantId, Function.identity()));
    }

    private StoreEntity loadCurrent() {
        TenantContext.requireTenantId();
        return stores.findFirstBy().orElseThrow(NotFoundException::new);
    }

    private String primaryHostname(StoreEntity store) {
        return domains.primaryHostnames(List.of(store.getTenantId())).get(store.getTenantId());
    }

    private static void validateCurrency(String code) {
        try {
            Currency.getInstance(code);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BusinessRuleException("INVALID_CURRENCY", "Nieprawidłowa waluta.");
        }
    }

    private static void validateTimezone(String zone) {
        try {
            ZoneId.of(zone);
        } catch (DateTimeException | NullPointerException e) {
            throw new BusinessRuleException("INVALID_TIMEZONE", "Nieprawidłowa strefa czasowa.");
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

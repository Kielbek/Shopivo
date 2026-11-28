package pl.shopivo.domains;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.domains.internal.StoreDomainEntity;
import pl.shopivo.domains.internal.StoreDomainRepository;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Hostname ↔ tenant mapping. Platform subdomains ({@code <slug>.<platform-domain>}) work immediately thanks to
 * wildcard DNS; custom domains (Cloudflare for SaaS) are implemented in phase 6.
 */
@Service
@Transactional
public class StoreDomains {

    /** Labels that can never be used as store subdomains. */
    public static final Set<String> RESERVED_LABELS = Set.of(
            "www", "app", "admin", "api", "cdn", "static", "assets", "media", "img", "images", "mail", "smtp", "imap",
            "pop", "ftp", "customers", "shop", "store", "sklep", "help", "pomoc", "support", "status", "docs", "blog",
            "dev", "test", "staging", "demo", "auth", "login", "account", "konto", "billing", "platform", "shopivo",
            "dashboard", "panel", "ns1", "ns2", "mx", "webmail", "root", "system", "internal");

    private static final Pattern LABEL = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$");
    /** RFC 1123 hostname (lower-case, no port). Anything else is rejected before touching cache or database. */
    private static final Pattern HOSTNAME = Pattern.compile(
            "^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z][a-z0-9-]{0,62}$");

    private final StoreDomainRepository domains;
    private final ShopivoProperties properties;
    /**
     * Bounded (the key is attacker-controlled: any Host header) and short-lived, so status changes propagate to
     * every replica within the TTL. Negative results are cached too, to absorb floods of unknown hosts.
     */
    private final Cache<String, Optional<UUID>> resolutionCache = Caffeine.newBuilder()
            .maximumSize(20_000)
            .expireAfterWrite(Duration.ofSeconds(30))
            .build();

    StoreDomains(StoreDomainRepository domains, ShopivoProperties properties) {
        this.domains = domains;
        this.properties = properties;
    }

    /** Normalizes a Host header value ("Shop.Example.com:443." → "shop.example.com"); empty if not a valid hostname. */
    public static Optional<String> normalizeHost(String hostHeader) {
        if (hostHeader == null || hostHeader.length() > 300) {
            return Optional.empty();
        }
        String host = hostHeader.trim().toLowerCase(Locale.ROOT).replaceAll(":\\d{1,5}$", "").replaceAll("\\.$", "");
        return HOSTNAME.matcher(host).matches() ? Optional.of(host) : Optional.empty();
    }

    public static boolean isValidSubdomainLabel(String label) {
        return label != null && label.length() >= 3 && label.length() <= 40 && LABEL.matcher(label).matches()
                && !label.contains("--") && !RESERVED_LABELS.contains(label);
    }

    public String platformHostname(String slug) {
        return slug.toLowerCase(Locale.ROOT) + "." + properties.platformDomain();
    }

    /** Creates the primary platform subdomain for the tenant bound to the current context. */
    public StoreDomainView createPlatformSubdomain(String slug) {
        if (!isValidSubdomainLabel(slug)) {
            throw new BusinessRuleException("INVALID_SLUG", "Nieprawidłowy adres sklepu.");
        }
        TenantContext.requireTenantId();
        StoreDomainEntity entity = domains.save(StoreDomainEntity.platformSubdomain(platformHostname(slug)));
        return entity.toView();
    }

    @Transactional(readOnly = true)
    public List<StoreDomainView> currentTenantDomains() {
        TenantContext.requireTenantId();
        return domains.findAllByOrderByCreatedAtAsc().stream().map(StoreDomainEntity::toView).toList();
    }

    /** Primary hostnames of the given tenants. The ids must come from verified memberships or system context. */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    public java.util.Map<UUID, String> primaryHostnames(java.util.Collection<UUID> tenantIds) {
        if (tenantIds.isEmpty()) {
            return java.util.Map.of();
        }
        return TenantContext.callAsSystem(() -> domains.findPrimaryByTenantIds(tenantIds).stream()
                .collect(java.util.stream.Collectors.toMap(StoreDomainEntity::getTenantId, StoreDomainEntity::getHostname)));
    }

    /**
     * Resolves an active hostname to its tenant (storefront routing). Uses a short-lived local cache; the lookup itself
     * is cross-tenant and therefore runs in system context.
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    public Optional<UUID> resolveTenant(String hostHeader) {
        return normalizeHost(hostHeader).flatMap(host -> pl.shopivo.shared.cache.Caches.get(resolutionCache, host, h -> TenantContext.callAsSystem(
                () -> domains.findActiveByHostname(h).map(StoreDomainEntity::getTenantId))));
    }

    public void evictCache() {
        resolutionCache.invalidateAll();
    }
}

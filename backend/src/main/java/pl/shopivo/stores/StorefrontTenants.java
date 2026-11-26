package pl.shopivo.stores;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import pl.shopivo.domains.StoreDomains;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.usage.UsageRecorder;
import pl.shopivo.tenants.TenantMemberships;

/**
 * Resolves the store of a public storefront request from the Host header (never from client-supplied ids), applies the
 * per-IP rate limit, the availability policies (e.g. expired subscription) and records usage.
 */
@Component
public class StorefrontTenants {

    private final StoreDomains domains;
    private final TenantMemberships tenants;
    private final RateLimiter rateLimiter;
    private final List<StorefrontAvailabilityPolicy> availability;
    private final List<UsageRecorder> usage;
    private final Stores stores;
    private final StorePreviewTokens previews;
    private final com.github.benmanes.caffeine.cache.Cache<UUID, StoreStatus> statuses =
            com.github.benmanes.caffeine.cache.Caffeine.newBuilder().expireAfterWrite(Duration.ofSeconds(30)).maximumSize(50_000).build();

    StorefrontTenants(StoreDomains domains, TenantMemberships tenants, RateLimiter rateLimiter,
            List<StorefrontAvailabilityPolicy> availability, List<UsageRecorder> usage, Stores stores, StorePreviewTokens previews) {
        this.stores = stores;
        this.previews = previews;
        this.domains = domains;
        this.tenants = tenants;
        this.rateLimiter = rateLimiter;
        this.availability = availability;
        this.usage = usage;
    }

    public UUID resolve(HttpServletRequest request) {
        // Keyed by client IP only: the host is attacker-controlled and would allow bypassing the limit.
        rateLimiter.consume("storefront:" + request.getRemoteAddr(), 600, Duration.ofMinutes(1));
        UUID tenantId = domains.resolveTenant(request.getServerName()).filter(tenants::isTenantActive)
                .orElseThrow(NotFoundException::new);
        if (availability.stream().anyMatch(p -> !p.isAvailable(tenantId))) {
            throw new NotFoundException("Sklep jest tymczasowo niedostępny.");
        }
        usage.forEach(u -> u.record(tenantId, "storefront.requests", 1));
        return tenantId;
    }

    /**
     * Like {@link #resolve} but only for a published store — or for someone holding a valid preview token
     * ({@code X-Store-Preview}). Catalogue, cart and checkout use this; the store info endpoint does not.
     */
    public UUID resolvePublished(HttpServletRequest request) {
        UUID tenantId = resolve(request);
        if (statuses.get(tenantId, id -> pl.shopivo.shared.tenancy.TenantContext.callInTenant(id, () -> stores.current().status()))
                != StoreStatus.PUBLISHED && !isPreview(request, tenantId)) {
            throw new pl.shopivo.shared.error.ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "STORE_NOT_PUBLISHED",
                    "Sklep jest w przygotowaniu.");
        }
        return tenantId;
    }

    public boolean isPreview(HttpServletRequest request, UUID tenantId) {
        return previews.isValid(request.getHeader("X-Store-Preview"), tenantId);
    }

    /** Called after publish/unpublish on this node (other nodes follow within 30 s). */
    public void evict(UUID tenantId) {
        statuses.invalidate(tenantId);
    }
}

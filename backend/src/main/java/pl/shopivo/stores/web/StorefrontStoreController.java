package pl.shopivo.stores.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.domains.StoreDomains;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.usage.UsageRecorder;
import pl.shopivo.stores.StoreStatus;
import pl.shopivo.stores.StorefrontAvailabilityPolicy;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.Stores;
import pl.shopivo.tenants.TenantMemberships;

/**
 * Public storefront API. The store is resolved from the request host (Host, or X-Forwarded-Host from a trusted
 * proxy such as the SSR server) — never from a client-supplied identifier.
 */
@RestController
@Tag(name = "Storefront")
class StorefrontStoreController {

    private final StoreDomains domains;
    private final TenantMemberships tenants;
    private final Stores stores;
    private final RateLimiter rateLimiter;
    private final List<StorefrontAvailabilityPolicy> availability;
    private final List<UsageRecorder> usage;

    StorefrontStoreController(StoreDomains domains, TenantMemberships tenants, Stores stores, RateLimiter rateLimiter,
            List<StorefrontAvailabilityPolicy> availability, List<UsageRecorder> usage) {
        this.domains = domains;
        this.tenants = tenants;
        this.stores = stores;
        this.rateLimiter = rateLimiter;
        this.availability = availability;
        this.usage = usage;
    }

    record PublicStore(String name, StoreStatus status, String locale, String currency, String hostname) {
    }

    @GetMapping("/api/v1/storefront/store")
    ResponseEntity<PublicStore> store(HttpServletRequest request) {
        String host = request.getServerName();
        // Keyed by client IP only: the host is attacker-controlled and would allow bypassing the limit.
        rateLimiter.consume("storefront:" + request.getRemoteAddr(), 600, Duration.ofMinutes(1));
        UUID tenantId = domains.resolveTenant(host).filter(tenants::isTenantActive).orElseThrow(NotFoundException::new);
        if (availability.stream().anyMatch(p -> !p.isAvailable(tenantId))) {
            throw new NotFoundException("Sklep jest tymczasowo niedostępny.");
        }
        usage.forEach(u -> u.record(tenantId, "storefront.requests", 1));
        StoreView store = TenantContext.callInTenant(tenantId, stores::current);
        if (store.status() == StoreStatus.SUSPENDED) {
            throw new NotFoundException();
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(30)).cachePublic())
                .body(new PublicStore(store.name(), store.status(), store.defaultLocale(), store.defaultCurrency(),
                        store.primaryHostname()));
    }
}

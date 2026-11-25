package pl.shopivo.stores.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StoreStatus;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.Stores;
import pl.shopivo.stores.StorefrontTenants;

/**
 * Public storefront API. The store is resolved from the request host (Host, or X-Forwarded-Host from a trusted
 * proxy such as the SSR server) — never from a client-supplied identifier.
 */
@RestController
@Tag(name = "Storefront")
class StorefrontStoreController {

    private final StorefrontTenants storefront;
    private final Stores stores;

    StorefrontStoreController(StorefrontTenants storefront, Stores stores) {
        this.storefront = storefront;
        this.stores = stores;
    }

    record PublicStore(String name, StoreStatus status, String locale, String currency, String hostname) {
    }

    @GetMapping("/api/v1/storefront/store")
    ResponseEntity<PublicStore> store(HttpServletRequest request) {
        UUID tenantId = storefront.resolve(request);
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

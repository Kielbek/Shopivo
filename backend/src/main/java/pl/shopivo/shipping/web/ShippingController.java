package pl.shopivo.shipping.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.orders.ShippingMethods;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shipping.CarrierAccounts;
import pl.shopivo.shipping.CarrierModels.Point;
import pl.shopivo.shipping.PickupPoints;
import pl.shopivo.shipping.Shipments;
import pl.shopivo.stores.StorefrontTenants;

@RestController
@Tag(name = "Shipping")
class ShippingController {

    private final CarrierAccounts accounts;
    private final Shipments shipments;
    private final PickupPoints points;
    private final ShippingMethods methods;
    private final StorefrontTenants storefront;
    private final RateLimiter rateLimiter;
    private final TransactionTemplate tx;

    ShippingController(CarrierAccounts accounts, Shipments shipments, PickupPoints points, ShippingMethods methods, StorefrontTenants storefront,
            RateLimiter rateLimiter, TransactionTemplate tx) {
        this.accounts = accounts;
        this.shipments = shipments;
        this.points = points;
        this.methods = methods;
        this.storefront = storefront;
        this.rateLimiter = rateLimiter;
        this.tx = tx;
    }

    // ------------------------------------------------------------------------------------------------ carrier accounts

    @GetMapping("/api/v1/tenants/{tenantId}/carriers")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    CarrierAccounts.Overview carriers(@PathVariable UUID tenantId) {
        return accounts.overview();
    }

    @PutMapping("/api/v1/tenants/{tenantId}/carriers/{carrier}")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    CarrierAccounts.AccountState save(@PathVariable UUID tenantId, @PathVariable String carrier, @RequestBody CarrierAccounts.SaveInput input) {
        return accounts.save(carrier, input);
    }

    @PostMapping("/api/v1/tenants/{tenantId}/carriers/{carrier}/test")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    CarrierAccounts.AccountState test(@PathVariable UUID tenantId, @PathVariable String carrier) {
        return accounts.test(carrier);
    }

    record EnabledRequest(boolean enabled) {
    }

    @PostMapping("/api/v1/tenants/{tenantId}/carriers/{carrier}/enabled")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    CarrierAccounts.AccountState enable(@PathVariable UUID tenantId, @PathVariable String carrier, @RequestBody EnabledRequest request) {
        return accounts.setEnabled(carrier, request.enabled());
    }

    // ------------------------------------------------------------------------------------------------ shipments

    @GetMapping("/api/v1/tenants/{tenantId}/orders/{orderId}/shipments")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    List<Shipments.ShipmentView> list(@PathVariable UUID tenantId, @PathVariable UUID orderId) {
        return shipments.list(orderId);
    }

    @PostMapping("/api/v1/tenants/{tenantId}/orders/{orderId}/shipments")
    @PreAuthorize("@tenantAccess.can('ORDERS_WRITE')")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    Shipments.ShipmentView create(@PathVariable UUID tenantId, @PathVariable UUID orderId, @RequestBody Shipments.CreateInput input) {
        return shipments.create(orderId, input, SecurityUtils.currentUser().map(u -> u.id()).orElse(null));
    }

    @PostMapping("/api/v1/tenants/{tenantId}/shipments/{shipmentId}/refresh")
    @PreAuthorize("@tenantAccess.can('ORDERS_WRITE')")
    Shipments.ShipmentView refresh(@PathVariable UUID tenantId, @PathVariable UUID shipmentId) {
        return shipments.refresh(shipmentId);
    }

    @GetMapping("/api/v1/tenants/{tenantId}/shipments/{shipmentId}/label")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    ResponseEntity<byte[]> label(@PathVariable UUID tenantId, @PathVariable UUID shipmentId) {
        byte[] pdf = shipments.label(shipmentId);
        if (pdf == null || pdf.length < 5 || !new String(pdf, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-")) {
            throw new pl.shopivo.shared.error.BusinessRuleException("LABEL_INVALID", "Przewoźnik nie zwrócił etykiety PDF. Spróbuj ponownie.");
        }
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("etykieta-" + shipmentId + ".pdf").build().toString())
                .header("X-Content-Type-Options", "nosniff").body(pdf);
    }

    // ------------------------------------------------------------------------------------------------ storefront

    /** Parcel lockers for a shipping method (by postal code or city). */
    @GetMapping("/api/v1/storefront/pickup-points")
    ResponseEntity<List<Point>> pickupPoints(HttpServletRequest request, @RequestParam("metoda") UUID methodId, @RequestParam String q) {
        UUID tenant = storefront.resolvePublished(request);
        rateLimiter.consume("pickup-points:" + request.getRemoteAddr(), 60, Duration.ofMinutes(1));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic()).body(TenantContext.callInTenant(tenant, () -> {
            var method = tx.execute(s -> methods.get(methodId));
            if (!method.active() || !method.requiresPickupPoint()) return List.of();
            return points.search(method.carrier(), q);
        }));
    }
}

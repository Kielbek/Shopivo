package pl.shopivo.stores.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.security.CurrentUser;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.stores.MyStoreView;
import pl.shopivo.stores.StoreProvisioning;
import pl.shopivo.stores.StoreSettingsView;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.Stores;

@RestController
@Tag(name = "Stores")
class StoreControllers {

    private final Stores stores;
    private final StoreProvisioning provisioning;
    private final RateLimiter rateLimiter;
    private final ShopivoProperties properties;
    private final pl.shopivo.stores.StorefrontTenants storefront;
    private final pl.shopivo.stores.StorePreviewTokens previews;
    private final String storefrontUrlTemplate;

    StoreControllers(Stores stores, StoreProvisioning provisioning, RateLimiter rateLimiter, ShopivoProperties properties,
            pl.shopivo.stores.StorefrontTenants storefront, pl.shopivo.stores.StorePreviewTokens previews,
            @org.springframework.beans.factory.annotation.Value("${shopivo.storefront-url-template:https://{host}}") String storefrontUrlTemplate) {
        this.storefront = storefront;
        this.previews = previews;
        this.storefrontUrlTemplate = storefrontUrlTemplate;
        this.stores = stores;
        this.provisioning = provisioning;
        this.rateLimiter = rateLimiter;
        this.properties = properties;
    }

    record CreateStoreRequest(
            @NotBlank @Size(min = 2, max = 150) String name,
            @NotBlank @Size(min = 3, max = 40) String slug,
            pl.shopivo.stores.StoreIndustry industry,
            java.util.List<pl.shopivo.stores.StoreIndustry> industries) {
    }

    /** {@code industries} (primary first); the single {@code industry} is still accepted from older clients. */
    record IndustryRequest(pl.shopivo.stores.StoreIndustry industry, java.util.List<pl.shopivo.stores.StoreIndustry> industries) {
    }

    record UpdateStoreRequest(
            @NotBlank @Size(min = 2, max = 150) String name,
            @Email @Size(max = 320) String contactEmail,
            @NotBlank String defaultLocale,
            @NotBlank @Pattern(regexp = "[A-Z]{3}") String defaultCurrency,
            @NotBlank @Size(max = 50) String timezone,
            long version) {
    }

    record UpdateSettingsRequest(
            @Size(max = 255) String legalCompanyName,
            @Size(max = 20) String taxId,
            @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @Size(max = 20) String postalCode,
            @Size(max = 100) String city,
            @NotNull @Pattern(regexp = "[A-Z]{2}") String countryCode,
            @Size(max = 30) @Pattern(regexp = "^$|^\\+?[0-9 ()-]{6,30}$") String phone,
            @Email @Size(max = 320) String orderEmail,
            boolean pricesIncludeTax,
            long version) {
    }

    record PlatformConfig(String platformDomain, String storefrontUrlTemplate) {
    }

    @GetMapping("/api/v1/stores/config")
    PlatformConfig config() {
        return new PlatformConfig(properties.platformDomain(), storefrontUrlTemplate);
    }

    @GetMapping("/api/v1/stores")
    List<MyStoreView> myStores() {
        return stores.storesOfUser(SecurityUtils.requireUser().id());
    }

    @PostMapping("/api/v1/stores")
    @ResponseStatus(HttpStatus.CREATED)
    StoreView create(@Valid @RequestBody CreateStoreRequest request) {
        CurrentUser user = SecurityUtils.requireUser();
        rateLimiter.consume("store-create:" + user.id(), 5, java.time.Duration.ofHours(1));
        return provisioning.createStore(user, request.name(), request.slug(),
                pl.shopivo.stores.StoreIndustry.normalize(request.industries(), request.industry()));
    }

    @GetMapping("/api/v1/stores/slug-availability")
    StoreProvisioning.SlugAvailability slugAvailability(@RequestParam String slug) {
        rateLimiter.consume("slug-check:" + SecurityUtils.requireUser().id(), 60, java.time.Duration.ofMinutes(1));
        return provisioning.checkSlug(slug);
    }

    @GetMapping("/api/v1/tenants/{tenantId}/store")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    StoreView store(@PathVariable UUID tenantId) {
        return stores.current();
    }

    @PatchMapping("/api/v1/tenants/{tenantId}/store")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    StoreView update(@PathVariable UUID tenantId, @Valid @RequestBody UpdateStoreRequest r) {
        return stores.update(new Stores.StoreUpdate(r.name(), r.contactEmail(), r.defaultLocale(), r.defaultCurrency(),
                r.timezone(), r.version()));
    }

    @PutMapping("/api/v1/tenants/{tenantId}/store/industry")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    StoreView updateIndustry(@PathVariable UUID tenantId, @RequestBody IndustryRequest r) {
        return stores.setIndustries(pl.shopivo.stores.StoreIndustry.normalize(r.industries(), r.industry()));
    }

    @GetMapping("/api/v1/tenants/{tenantId}/store/settings")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    StoreSettingsView settings(@PathVariable UUID tenantId) {
        return stores.currentSettings();
    }

    @PutMapping("/api/v1/tenants/{tenantId}/store/settings")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    StoreSettingsView updateSettings(@PathVariable UUID tenantId, @Valid @RequestBody UpdateSettingsRequest r) {
        return stores.updateSettings(new StoreSettingsView(r.legalCompanyName(), r.taxId(), r.addressLine1(),
                r.addressLine2(), r.postalCode(), r.city(), r.countryCode(), r.phone(), r.orderEmail(),
                r.pricesIncludeTax(), r.version()));
    }

    record Readiness(boolean ready, List<String> missing) {
    }

    record Preview(String token, String url) {
    }

    @GetMapping("/api/v1/tenants/{tenantId}/store/publish-readiness")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    Readiness readiness(@PathVariable UUID tenantId) {
        List<String> missing = stores.publishReadiness();
        return new Readiness(missing.isEmpty(), missing);
    }

    @PostMapping("/api/v1/tenants/{tenantId}/store/publish")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    StoreView publish(@PathVariable UUID tenantId) {
        StoreView view = stores.publish();
        storefront.evict(tenantId);
        return view;
    }

    @PostMapping("/api/v1/tenants/{tenantId}/store/unpublish")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    StoreView unpublish(@PathVariable UUID tenantId) {
        StoreView view = stores.unpublish();
        storefront.evict(tenantId);
        return view;
    }

    /** Preview link for an unpublished store / draft theme (valid for 2 hours). */
    @PostMapping("/api/v1/tenants/{tenantId}/store/preview-token")
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    Preview preview(@PathVariable UUID tenantId) {
        String token = previews.issue(tenantId);
        return new Preview(token, storefrontUrlTemplate.replace("{host}", stores.current().primaryHostname()) + "/?podglad=" + token);
    }
}

package pl.shopivo.billing.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.billing.PlatformPaymentProviders;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;

@RestController
@RequestMapping("/api/v1/admin/payment-providers")
@Tag(name = "Platform administration")
class AdminPaymentProvidersController {

    private final PlatformPaymentProviders providers;

    AdminPaymentProvidersController(PlatformPaymentProviders providers) {
        this.providers = providers;
    }

    record SaveRequest(boolean enabled, boolean sandbox, Map<String, String> credentials) {
    }

    @GetMapping
    List<PlatformPaymentProviders.ProviderState> list() {
        return providers.list();
    }

    @PutMapping("/{provider}")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    PlatformPaymentProviders.ProviderState save(@PathVariable String provider, @RequestBody SaveRequest request) {
        return TenantContext.callAsSystem(() -> providers.save(provider, request.enabled(), request.sandbox(),
                request.credentials() == null ? Map.of() : request.credentials(), SecurityUtils.requireUser().id()));
    }

    @PostMapping("/{provider}/activate")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    PlatformPaymentProviders.ProviderState activate(@PathVariable String provider) {
        return providers.activate(provider);
    }

    @PostMapping("/{provider}/test")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    PlatformPaymentProviders.ProviderState test(@PathVariable String provider) {
        return providers.test(provider);
    }
}

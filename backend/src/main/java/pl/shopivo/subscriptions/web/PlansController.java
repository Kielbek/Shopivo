package pl.shopivo.subscriptions.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.subscriptions.BillingProperties;
import pl.shopivo.subscriptions.EntitlementKey;
import pl.shopivo.subscriptions.PlanCatalog;
import pl.shopivo.subscriptions.SubscriptionViews.PlanView;

/** Public plan list (pricing page, plan picker). Prices are net; VAT is added at payment. */
@RestController
@Tag(name = "Plans")
class PlansController {

    private final PlanCatalog catalog;
    private final BillingProperties properties;

    PlansController(PlanCatalog catalog, BillingProperties properties) {
        this.catalog = catalog;
        this.properties = properties;
    }

    record EntitlementDefinition(String key, String label, EntitlementKey.Kind kind) {
    }

    record PlansResponse(List<PlanView> plans, List<EntitlementDefinition> entitlements, int vatRateBps, String currency) {
    }

    @GetMapping("/api/v1/plans")
    ResponseEntity<PlansResponse> plans() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(new PlansResponse(catalog.publicPlans(), definitions(), properties.vatRateBps(), properties.currency()));
    }

    static List<EntitlementDefinition> definitions() {
        return Arrays.stream(EntitlementKey.values()).map(k -> new EntitlementDefinition(k.key(), k.label(), k.kind())).toList();
    }
}

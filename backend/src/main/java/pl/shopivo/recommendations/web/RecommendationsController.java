package pl.shopivo.recommendations.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.catalog.PublicCatalog.ProductCard;
import pl.shopivo.recommendations.Recommendations;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StorefrontTenants;

/** Public recommendation endpoints of a published store (same host resolution and caching as the catalogue). */
@RestController
@RequestMapping("/api/v1/storefront")
@Tag(name = "Storefront")
class RecommendationsController {

    private final StorefrontTenants storefront;
    private final Recommendations recommendations;
    private final TransactionTemplate tx;

    RecommendationsController(StorefrontTenants storefront, Recommendations recommendations, TransactionTemplate tx) {
        this.storefront = storefront;
        this.recommendations = recommendations;
        this.tx = tx;
    }

    /** Ready-made lists: bestsellery, promocje, koncowki, nowosci, najlepiej-oceniane, wracaja (optionally within a category). */
    @GetMapping("/collections/{source}")
    ResponseEntity<List<ProductCard>> collection(HttpServletRequest request, @PathVariable String source,
            @RequestParam(required = false) String kategoria, @RequestParam(defaultValue = "8") int limit) {
        UUID tenant = storefront.resolvePublished(request);
        Recommendations.Source s = Recommendations.Source.of(source);
        return cached(inTenant(tenant, () -> recommendations.list(s, kategoria, limit)), storefront.isPreview(request, tenant));
    }

    /** "Często kupowane razem" — only pairs from this store's orders (empty for a product nobody bought with others yet). */
    @GetMapping("/products/{slug}/bought-together")
    ResponseEntity<List<ProductCard>> boughtTogether(HttpServletRequest request, @PathVariable String slug, @RequestParam(defaultValue = "4") int limit) {
        UUID tenant = storefront.resolvePublished(request);
        if (slug.length() > 220) throw new NotFoundException();
        return cached(inTenant(tenant, () -> recommendations.boughtTogether(slug, limit)), storefront.isPreview(request, tenant));
    }

    /** "Podobne produkty" — same categories, close price, same brand. */
    @GetMapping("/products/{slug}/similar")
    ResponseEntity<List<ProductCard>> similar(HttpServletRequest request, @PathVariable String slug, @RequestParam(defaultValue = "4") int limit) {
        UUID tenant = storefront.resolvePublished(request);
        if (slug.length() > 220) throw new NotFoundException();
        return cached(inTenant(tenant, () -> recommendations.similar(slug, limit)), storefront.isPreview(request, tenant));
    }

    /**
     * Suggestions for the cart: {@code ids} = products in it (max 30), {@code brakuje} = gross amount (minor units)
     * still missing to free delivery, if any. Only product ids and an amount — no cart token, no personal data.
     */
    @GetMapping("/recommendations/cart")
    ResponseEntity<List<ProductCard>> cart(HttpServletRequest request, @RequestParam(required = false) List<UUID> ids,
            @RequestParam(required = false) Long brakuje, @RequestParam(defaultValue = "4") int limit) {
        UUID tenant = storefront.resolvePublished(request);
        if (ids != null && ids.size() > 30) throw new BusinessRuleException("TOO_MANY_IDS", "Za dużo produktów naraz.");
        if (brakuje != null && (brakuje < 0 || brakuje > 100_000_000)) throw new BusinessRuleException("INVALID_AMOUNT", "Nieprawidłowa kwota.");
        return cached(inTenant(tenant, () -> recommendations.cartComplements(ids, brakuje, limit)), storefront.isPreview(request, tenant));
    }

    private static <T> ResponseEntity<T> cached(T body, boolean preview) {
        return ResponseEntity.ok()
                .cacheControl(preview ? CacheControl.noStore() : CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .header(HttpHeaders.VARY, "X-Store-Preview")
                .body(body);
    }

    private <T> T inTenant(UUID tenant, Supplier<T> action) {
        return TenantContext.callInTenant(tenant, () -> tx.execute(s -> action.get()));
    }
}

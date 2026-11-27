package pl.shopivo.storefront;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.catalog.CatalogViews;
import pl.shopivo.catalog.PublicCatalog;
import pl.shopivo.catalog.ProductType;
import pl.shopivo.media.Media;
import pl.shopivo.reviews.Reviews;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.web.PageResponse;
import pl.shopivo.stores.StoreStatus;
import pl.shopivo.themes.ThemeAssets;
import pl.shopivo.themes.ThemeRegistry;
import pl.shopivo.themes.ThemeSamples;
import pl.shopivo.themes.Themes;

/**
 * Template demo: the same read API as a store, served from the template's example catalogue only — no store, tenant
 * or customer data is involved, and buying is switched off (the storefront shows a "template preview" banner).
 * Several templates can share one catalogue ({@link ThemeSamples#CATALOG_OF}).
 */
@RestController
@RequestMapping("/api/v1/storefront/demo/{code}")
@Tag(name = "Storefront")
class TemplateDemoController {

    private static final String DEMO_TEXT = """
            Przykładowy produkt w podglądzie szablonu. W Twoim sklepie w tym miejscu pojawi się opis Twojego produktu: \
            materiały, wymiary, wskazówki i wszystko, co pomaga klientom w decyzji.""";

    record Demo(Themes.ThemeConfig theme, String storeName, List<PublicCatalog.PublicCategory> categories,
            List<PublicCatalog.PublicProduct> products, Map<UUID, String> categoryOf) {
    }

    private final Map<String, Demo> demos = new ConcurrentHashMap<>();

    private Demo demo(String code) {
        ThemeRegistry.Preset preset = ThemeRegistry.preset(code).orElseThrow(() -> new NotFoundException("Nieznany szablon."));
        return demos.computeIfAbsent(preset.code(), k -> build(preset));
    }

    private static UUID id(String... parts) {
        return UUID.nameUUIDFromBytes(String.join("|", parts).getBytes(StandardCharsets.UTF_8));
    }

    static String slug(String name) {
        String s = Normalizer.normalize(name.replace("ł", "l").replace("Ł", "L"), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }

    private static Demo build(ThemeRegistry.Preset preset) {
        String code = preset.code();
        Map<String, PublicCatalog.PublicCategory> cats = new LinkedHashMap<>();
        for (ThemeSamples.SampleCategory c : ThemeSamples.categoriesFor(code)) {
            cats.put(c.name(), new PublicCatalog.PublicCategory(id(code, "cat", c.name()), null, c.name(), slug(c.name()), null, 0, null, null,
                    ThemeAssets.find(c.image()).map(ThemeAssets.Asset::urls).orElse(null)));
        }
        List<PublicCatalog.PublicProduct> products = new ArrayList<>();
        Map<UUID, String> categoryOf = new LinkedHashMap<>();
        for (ThemeSamples.Sample s : ThemeSamples.productsFor(code)) {
            cats.computeIfAbsent(s.category(), n -> new PublicCatalog.PublicCategory(id(code, "cat", n), null, n, slug(n), null, 0, null, null, null));
            UUID pid = id(code, "product", s.name());
            List<PublicCatalog.PublicVariant> variants = new ArrayList<>();
            List<String> sizes = s.sizes().isEmpty() ? List.of("") : s.sizes();
            for (String size : sizes) {
                variants.add(new PublicCatalog.PublicVariant(id(code, "variant", s.name(), size), size.isEmpty() ? Map.of() : Map.of("Rozmiar", size),
                        size.isEmpty() ? s.name() : size, null, s.priceMinor(), s.compareAtMinor(), null, true, false));
            }
            Map<String, String> urls = ThemeAssets.find(s.image()).map(ThemeAssets.Asset::urls).orElse(Map.of());
            var image = new Media.ImageView(id(code, "image", s.name()), s.name(), 1200, 1200, 0, urls);
            var cat = cats.get(s.category());
            products.add(new PublicCatalog.PublicProduct(pid, slug(s.name()), s.name(), DEMO_TEXT, null, ProductType.PHYSICAL, 2300, "PLN",
                    s.sizes().isEmpty() ? List.of() : List.of(new CatalogViews.OptionView("Rozmiar", s.sizes())), variants,
                    urls.isEmpty() ? List.of() : List.of(image), List.of(new PublicCatalog.Crumb(cat.name(), cat.slug())), null, null, Instant.EPOCH));
            categoryOf.put(pid, s.category());
        }
        String name = code.equals("BAWILOO") ? "Bawiloo" : code.equals("VERA") ? "Véra Studio" : preset.name();
        return new Demo(new Themes.ThemeConfig(code, preset.defaults(), preset.sections()), name, List.copyOf(cats.values()), List.copyOf(products),
                Map.copyOf(categoryOf));
    }

    private static PublicCatalog.ProductCard card(PublicCatalog.PublicProduct p) {
        var v = p.variants().getFirst();
        return new PublicCatalog.ProductCard(p.id(), p.slug(), p.name(), null, v.priceMinor(), v.priceMinor(), v.compareAtMinor(),
                v.lowestPrice30dMinor(), "PLN", true, p.images().isEmpty() ? null : p.images().getFirst().urls().get("w400"), p.name());
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic()).body(body);
    }

    private List<PublicCatalog.PublicProduct> inCategory(Demo d, String kategoria) {
        if (kategoria == null || kategoria.isBlank()) return d.products();
        var cat = d.categories().stream().filter(c -> c.slug().equals(kategoria)).findFirst().orElseThrow(() -> new NotFoundException("Nie znaleziono kategorii."));
        return d.products().stream().filter(p -> cat.name().equals(d.categoryOf().get(p.id()))).toList();
    }

    // ------------------------------------------------------------------------------------------------ store & catalogue

    @GetMapping("/store")
    ResponseEntity<StorefrontController.PublicStore> store(@PathVariable String code) {
        Demo d = demo(code);
        return ok(new StorefrontController.PublicStore(d.storeName(), StoreStatus.PUBLISHED, true, false, "pl-PL", "PLN", null, d.theme(), null,
                d.categories(), List.of(), false, List.of(), null, ThemeAssets.urls(), null));
    }

    @GetMapping("/categories")
    ResponseEntity<List<PublicCatalog.PublicCategory>> categories(@PathVariable String code) {
        return ok(demo(code).categories());
    }

    @GetMapping("/products")
    ResponseEntity<PageResponse<PublicCatalog.ProductCard>> products(@PathVariable String code, @RequestParam(required = false) String kategoria,
            @RequestParam(required = false) String q, @RequestParam(required = false) PublicCatalog.Sort sort,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "24") int size, @RequestParam(defaultValue = "false") boolean promocje) {
        Demo d = demo(code);
        String query = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        List<PublicCatalog.ProductCard> all = inCategory(d, kategoria).stream().map(TemplateDemoController::card)
                .filter(c -> !promocje || (c.compareAtMinor() != null && c.compareAtMinor() > c.priceMinor()))
                .filter(c -> query.isEmpty() || c.name().toLowerCase(Locale.ROOT).contains(query))
                .sorted(switch (sort == null ? PublicCatalog.Sort.NEWEST : sort) {
                    case NEWEST -> Comparator.comparingInt(c -> 0);
                    case PRICE_ASC -> Comparator.comparingLong(PublicCatalog.ProductCard::priceMinor);
                    case PRICE_DESC -> Comparator.comparingLong(PublicCatalog.ProductCard::priceMinor).reversed();
                    case NAME -> Comparator.comparing(c -> c.name().toLowerCase(Locale.ROOT));
                }).toList();
        int n = Math.clamp(size, 1, 48);
        int from = Math.min(Math.clamp(page, 0, 500) * n, all.size());
        var p = new PageImpl<>(all.subList(from, Math.min(from + n, all.size())), PageRequest.of(Math.clamp(page, 0, 500), n), all.size());
        return ok(PageResponse.of(p, c -> c));
    }

    @GetMapping("/product-cards")
    ResponseEntity<List<PublicCatalog.ProductCard>> cards(@PathVariable String code, @RequestParam List<UUID> ids) {
        Demo d = demo(code);
        return ok(ids.stream().limit(60).flatMap(i -> d.products().stream().filter(p -> p.id().equals(i))).map(TemplateDemoController::card).toList());
    }

    @GetMapping("/products/{slug}")
    ResponseEntity<PublicCatalog.PublicProduct> product(@PathVariable String code, @PathVariable String slug) {
        return ok(find(demo(code), slug));
    }

    private static PublicCatalog.PublicProduct find(Demo d, String slug) {
        return d.products().stream().filter(p -> p.slug().equals(slug)).findFirst().orElseThrow(() -> new NotFoundException("Nie znaleziono produktu."));
    }

    @GetMapping("/products/{slug}/reviews")
    ResponseEntity<StorefrontController.ProductReviews> reviews(@PathVariable String code, @PathVariable String slug) {
        find(demo(code), slug);
        return ok(new StorefrontController.ProductReviews(new Reviews.Summary(0, 0, new long[5]),
                PageResponse.of(new PageImpl<Reviews.PublicReview>(List.of(), PageRequest.of(0, 10), 0), r -> r)));
    }

    @GetMapping("/reviews/latest")
    ResponseEntity<List<Reviews.FeaturedReview>> latestReviews(@PathVariable String code) {
        demo(code);
        return ok(List.of());
    }

    @GetMapping("/posts")
    ResponseEntity<PageResponse<Object>> posts(@PathVariable String code) {
        demo(code);
        return ok(PageResponse.of(new PageImpl<>(List.of(), PageRequest.of(0, 12), 0), c -> c));
    }

    // ------------------------------------------------------------------------------------------------ recommendations

    /** In the demo the lists follow the catalogue's order (there are no sales to rank by). */
    @GetMapping("/collections/{source}")
    ResponseEntity<List<PublicCatalog.ProductCard>> collection(@PathVariable String code, @PathVariable String source,
            @RequestParam(required = false) String kategoria, @RequestParam(defaultValue = "8") int limit) {
        var cards = inCategory(demo(code), kategoria).stream().map(TemplateDemoController::card);
        if (source.equals("promocje")) cards = cards.filter(c -> c.compareAtMinor() != null)
                .sorted(Comparator.comparingDouble(c -> (double) c.priceMinor() / c.compareAtMinor()));
        else if (!List.of("bestsellery", "nowosci", "najlepiej-oceniane").contains(source)) cards = java.util.stream.Stream.empty();
        return ok(cards.limit(Math.clamp(limit, 1, 24)).toList());
    }

    @GetMapping({"/products/{slug}/bought-together", "/products/{slug}/similar"})
    ResponseEntity<List<PublicCatalog.ProductCard>> related(@PathVariable String code, @PathVariable String slug, @RequestParam(defaultValue = "4") int limit) {
        Demo d = demo(code);
        var me = find(d, slug);
        String cat = d.categoryOf().get(me.id());
        return ok(d.products().stream().filter(p -> !p.id().equals(me.id())).sorted(Comparator.comparing(p -> !cat.equals(d.categoryOf().get(p.id()))))
                .map(TemplateDemoController::card).limit(Math.clamp(limit, 1, 12)).toList());
    }

    @GetMapping("/recommendations/cart")
    ResponseEntity<List<PublicCatalog.ProductCard>> cart(@PathVariable String code) {
        demo(code);
        return ok(List.of());
    }

    // ------------------------------------------------------------------------------------------------ everything else

    /** Pages, carts, checkout, accounts, newsletter… are not part of a template preview. */
    @org.springframework.web.bind.annotation.RequestMapping("/**")
    ResponseEntity<ProblemDetail> other(@PathVariable String code) {
        demo(code);
        ProblemDetail p = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "To podgląd szablonu z przykładowymi produktami — koszyk, zamówienia i konta działają w Twoim sklepie.");
        p.setProperty("code", "TEMPLATE_DEMO");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(p);
    }
}

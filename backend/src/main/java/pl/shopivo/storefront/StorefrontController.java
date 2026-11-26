package pl.shopivo.storefront;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;
import pl.shopivo.catalog.PublicCatalog;
import pl.shopivo.content.ContentKind;
import pl.shopivo.content.PublicContent;
import pl.shopivo.content.Redirects;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.web.PageResponse;
import pl.shopivo.stores.StoreSettingsView;
import pl.shopivo.stores.StoreStatus;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.StorefrontTenants;
import pl.shopivo.stores.Stores;
import pl.shopivo.themes.Themes;

@RestController
@RequestMapping("/api/v1/storefront")
@Tag(name = "Storefront")
class StorefrontController {

    private final StorefrontTenants storefront;
    private final Stores stores;
    private final Themes themes;
    private final PublicCatalog catalog;
    private final PublicContent content;
    private final Redirects redirects;
    private final TransactionTemplate tx;
    private final String urlTemplate;

    StorefrontController(StorefrontTenants storefront, Stores stores, Themes themes, PublicCatalog catalog, PublicContent content, Redirects redirects, TransactionTemplate tx,
            @Value("${shopivo.storefront-url-template:https://{host}}") String urlTemplate) {
        this.storefront = storefront;
        this.stores = stores;
        this.themes = themes;
        this.catalog = catalog;
        this.content = content;
        this.redirects = redirects;
        this.tx = tx;
        this.urlTemplate = urlTemplate;
    }

    /** Seller identification shown in the footer (required for distance selling in Poland). */
    record Seller(String companyName, String taxId, String address, String email, String phone) {
    }

    record PublicStore(String name, StoreStatus status, boolean open, boolean preview, String locale, String currency,
            String hostname, Themes.ThemeConfig theme, Seller seller, List<PublicCatalog.PublicCategory> categories,
            List<PublicContent.Link> footerLinks, boolean blog) {
    }

    @GetMapping("/store")
    ResponseEntity<PublicStore> store(HttpServletRequest request) {
        UUID tenant = storefront.resolve(request);
        boolean preview = storefront.isPreview(request, tenant);
        PublicStore body = inTenant(tenant, () -> {
            StoreView s = stores.current();
            if (s.status() == StoreStatus.SUSPENDED) throw new NotFoundException();
            boolean open = s.status() == StoreStatus.PUBLISHED || preview;
            StoreSettingsView st = stores.currentSettings();
            String address = st.addressLine1() == null ? null : String.join(", ", java.util.stream.Stream.of(st.addressLine1(),
                    st.addressLine2(), (st.postalCode() == null ? "" : st.postalCode() + " ") + (st.city() == null ? "" : st.city()))
                    .filter(x -> x != null && !x.isBlank()).toList());
            // Seller data (often a sole trader's home address and phone) becomes public only once the merchant publishes.
            Seller seller = !open ? null : new Seller(st.legalCompanyName(), st.taxId(), address,
                    st.orderEmail() != null ? st.orderEmail() : s.contactEmail(), st.phone());
            return new PublicStore(s.name(), s.status(), open, preview, s.defaultLocale(), s.defaultCurrency(), s.primaryHostname(),
                    themes.storefront(preview), seller, open ? catalog.categories() : List.of(),
                    open ? content.footerLinks() : List.of(), open && content.hasPosts());
        });
        return cached(body, preview);
    }

    @GetMapping("/categories")
    ResponseEntity<List<PublicCatalog.PublicCategory>> categories(HttpServletRequest request) {
        UUID tenant = storefront.resolvePublished(request);
        return cached(inTenant(tenant, catalog::categories), storefront.isPreview(request, tenant));
    }

    @GetMapping("/products")
    ResponseEntity<PageResponse<PublicCatalog.ProductCard>> products(HttpServletRequest request,
            @RequestParam(required = false) String kategoria, @RequestParam(required = false) String q,
            @RequestParam(required = false) PublicCatalog.Sort sort, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "24") int size) {
        UUID tenant = storefront.resolvePublished(request);
        var result = inTenant(tenant, () -> PageResponse.of(catalog.products(kategoria, q, sort,
                PageRequest.of(Math.clamp(page, 0, 500), Math.clamp(size, 1, 48))), c -> c));
        return cached(result, storefront.isPreview(request, tenant));
    }

    @GetMapping("/products/{slug}")
    ResponseEntity<PublicCatalog.PublicProduct> product(HttpServletRequest request, @PathVariable String slug) {
        UUID tenant = storefront.resolvePublished(request);
        if (slug.length() > 220) throw new NotFoundException();
        return cached(inTenant(tenant, () -> catalog.product(slug)), storefront.isPreview(request, tenant));
    }

    @GetMapping("/pages/{slug}")
    ResponseEntity<PublicContent.PublicEntry> page(HttpServletRequest request, @PathVariable String slug) {
        UUID tenant = storefront.resolvePublished(request);
        boolean preview = storefront.isPreview(request, tenant);
        return cached(inTenant(tenant, () -> content.entry(ContentKind.PAGE, slug, preview)), preview);
    }

    @GetMapping("/posts")
    ResponseEntity<PageResponse<PublicContent.PostCard>> posts(HttpServletRequest request, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        UUID tenant = storefront.resolvePublished(request);
        var result = inTenant(tenant, () -> PageResponse.of(content.posts(PageRequest.of(Math.clamp(page, 0, 500), Math.clamp(size, 1, 48))), c -> c));
        return cached(result, storefront.isPreview(request, tenant));
    }

    @GetMapping("/posts/{slug}")
    ResponseEntity<PublicContent.PublicEntry> post(HttpServletRequest request, @PathVariable String slug) {
        UUID tenant = storefront.resolvePublished(request);
        boolean preview = storefront.isPreview(request, tenant);
        return cached(inTenant(tenant, () -> content.entry(ContentKind.POST, slug, preview)), preview);
    }

    record RedirectTarget(String location) {
    }

    /** 301 target for a path the storefront could not find (asked by the SSR server only after a 404). */
    @GetMapping("/redirect")
    ResponseEntity<RedirectTarget> redirect(HttpServletRequest request, @RequestParam String path) {
        UUID tenant = storefront.resolvePublished(request);
        return inTenant(tenant, () -> redirects.resolve(path)).map(to -> cached(new RedirectTarget(to), false))
                .orElseThrow(NotFoundException::new);
    }

    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    ResponseEntity<String> sitemap(HttpServletRequest request) {
        UUID tenant = storefront.resolvePublished(request);
        String base = base(request);
        StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        xml.append("  <url><loc>").append(HtmlUtils.htmlEscape(base + "/")).append("</loc></url>\n");
        record Entry(String path, java.time.Instant lastModified) {
        }
        List<Entry> entries = new java.util.ArrayList<>();
        inTenant(tenant, () -> {
            catalog.sitemap().forEach(e -> entries.add(new Entry(e.path(), e.lastModified())));
            content.sitemap().forEach(e -> entries.add(new Entry(e.path(), e.lastModified())));
            if (content.hasPosts()) entries.add(new Entry("/blog", null));
            return null;
        });
        for (var e : entries) {
            xml.append("  <url><loc>").append(HtmlUtils.htmlEscape(base + e.path())).append("</loc>");
            if (e.lastModified() != null) xml.append("<lastmod>").append(DateTimeFormatter.ISO_INSTANT.format(e.lastModified())).append("</lastmod>");
            xml.append("</url>\n");
        }
        xml.append("</urlset>\n");
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic()).body(xml.toString());
    }

    /** Unpublished stores ask crawlers to stay away. */
    @GetMapping(value = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
    ResponseEntity<String> robots(HttpServletRequest request) {
        UUID tenant = storefront.resolve(request);
        boolean open = inTenant(tenant, () -> stores.current().status() == StoreStatus.PUBLISHED);
        String body = open
                ? "User-agent: *\nAllow: /\nDisallow: /koszyk\nDisallow: /zamowienie\nDisallow: /szukaj\n\nSitemap: " + base(request) + "/sitemap.xml\n"
                : "User-agent: *\nDisallow: /\n";
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic()).body(body);
    }

    /**
     * Public origin of the store. Built from the configured template (https in production) and the host the tenant was
     * resolved from, never from the request scheme/port, which reflect the internal hop behind the SSR server or proxy.
     */
    private String base(HttpServletRequest request) {
        return urlTemplate.replace("{host}", request.getServerName().toLowerCase(java.util.Locale.ROOT));
    }

    /** Short public caching for shared CDNs; previews (draft data) are never cached. */
    private static <T> ResponseEntity<T> cached(T body, boolean preview) {
        return ResponseEntity.ok()
                .cacheControl(preview ? CacheControl.noStore() : CacheControl.maxAge(Duration.ofSeconds(30)).cachePublic())
                .header(HttpHeaders.VARY, "X-Store-Preview")
                .body(body);
    }

    private <T> T inTenant(UUID tenant, Supplier<T> action) {
        return TenantContext.callInTenant(tenant, () -> tx.execute(s -> action.get()));
    }
}

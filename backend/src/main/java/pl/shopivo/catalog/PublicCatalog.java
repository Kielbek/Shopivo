package pl.shopivo.catalog;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.media.Media;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.Stores;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Read model of the catalogue for customers: only ACTIVE products and visible categories, gross prices, Omnibus
 * reference price, availability as flags (exact stock levels are not disclosed to the public).
 */
@Service
public class PublicCatalog {

    static final int LOW_STOCK = 3;

    private final JdbcTemplate jdbc;
    private final Media media;
    private final Stores stores;
    private final PriceHistory prices;
    private final JsonMapper json;

    PublicCatalog(JdbcTemplate jdbc, Media media, Stores stores, PriceHistory prices, JsonMapper json) {
        this.jdbc = jdbc;
        this.media = media;
        this.stores = stores;
        this.prices = prices;
        this.json = json;
    }

    public record PublicCategory(UUID id, UUID parentId, String name, String slug, String description, int depth,
            String seoTitle, String seoDescription, Map<String, String> image) {
    }

    public record Crumb(String name, String slug) {
    }

    public record ProductCard(UUID id, String slug, String name, String brand, long priceMinor, long maxPriceMinor,
            Long compareAtMinor, Long lowestPrice30dMinor, String currency, boolean available, String imageUrl, String imageAlt) {
    }

    public record PublicVariant(UUID id, Map<String, String> optionValues, String title, String sku, long priceMinor,
            Long compareAtMinor, Long lowestPrice30dMinor, boolean available, boolean lowStock) {
    }

    public record PublicProduct(UUID id, String slug, String name, String description, String brand, ProductType type,
            int vatRateBps, String currency, List<CatalogViews.OptionView> options, List<PublicVariant> variants,
            List<Media.ImageView> images, List<Crumb> breadcrumbs, String seoTitle, String seoDescription, Instant updatedAt) {
    }

    public record SitemapEntry(String path, Instant lastModified) {
    }

    public enum Sort { NEWEST, PRICE_ASC, PRICE_DESC, NAME }

    @Transactional(readOnly = true)
    public List<PublicCategory> categories() {
        // A hidden category hides its whole subtree.
        List<PublicCategory> list = jdbc.query("""
                select c.* from categories c where c.tenant_id = ?
                  and not exists (select 1 from categories h where h.tenant_id = c.tenant_id and not h.visible and c.path like h.path || '%')
                order by c.depth, c.position, lower(c.name)
                """, (rs, i) -> new PublicCategory(rs.getObject("id", UUID.class), rs.getObject("parent_id", UUID.class),
                rs.getString("name"), rs.getString("slug"), rs.getString("description"), rs.getInt("depth"), rs.getString("seo_title"),
                rs.getString("seo_description"), null), TenantContext.requireTenantId());
        Map<UUID, List<Media.ImageView>> images = media.list(Media.CATEGORY_OWNER, list.stream().map(PublicCategory::id).toList());
        return list.stream().map(c -> {
            List<Media.ImageView> img = images.get(c.id());
            return img == null || img.isEmpty() ? c : new PublicCategory(c.id(), c.parentId(), c.name(), c.slug(), c.description(), c.depth(),
                    c.seoTitle(), c.seoDescription(), img.getFirst().urls());
        }).toList();
    }

    @Transactional(readOnly = true)
    public Page<ProductCard> products(String categorySlug, String query, Sort sort, Pageable pageable) {
        return products(categorySlug, query, sort, false, pageable);
    }

    /** {@code onSale}: only products with a variant priced below its "before discount" price. */
    @Transactional(readOnly = true)
    public Page<ProductCard> products(String categorySlug, String query, Sort sort, boolean onSale, Pageable pageable) {
        return products(categorySlug, query, sort, onSale, null, pageable);
    }

    /** Cards of these products (active ones only), in the order given — favourites, recently viewed. */
    @Transactional(readOnly = true)
    public List<ProductCard> cards(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        List<UUID> wanted = ids.stream().distinct().limit(60).toList();
        Map<UUID, ProductCard> found = new HashMap<>();
        products(null, null, Sort.NEWEST, false, wanted, org.springframework.data.domain.PageRequest.of(0, wanted.size()))
                .forEach(c -> found.put(c.id(), c));
        return wanted.stream().map(found::get).filter(java.util.Objects::nonNull).toList();
    }

    private Page<ProductCard> products(String categorySlug, String query, Sort sort, boolean onSale, List<UUID> ids, Pageable pageable) {
        UUID tenant = TenantContext.requireTenantId();
        StringBuilder where = new StringBuilder(" where p.tenant_id = ? and p.status = 'ACTIVE'");
        List<Object> args = new ArrayList<>(List.of(tenant));
        if (ids != null) {
            where.append(" and p.id = any(?)");
            args.add(ids.toArray(UUID[]::new));
        }
        if (onSale) {
            where.append(" and exists (select 1 from product_variants sv where sv.product_id = p.id and sv.compare_at_minor is not null and sv.compare_at_minor > sv.price_minor)");
        }
        if (categorySlug != null && !categorySlug.isBlank()) {
            String path = categories().stream().filter(c -> c.slug().equals(categorySlug)).findFirst()
                    .map(c -> jdbc.queryForObject("select path from categories where tenant_id = ? and id = ?", String.class, tenant, c.id()))
                    .orElseThrow(() -> new NotFoundException("Nie znaleziono kategorii."));
            where.append(" and exists (select 1 from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = p.id and c.path like ? || '%')");
            args.add(path);
        }
        if (query != null && !query.isBlank()) {
            String q = query.strip();
            if (q.length() > 100) q = q.substring(0, 100);
            String like = "%" + q.toLowerCase(java.util.Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            where.append(" and (lower(p.name) like ? or lower(coalesce(p.description, '')) like ?)");
            args.add(like);
            args.add(like);
        }
        String from = """
                 from products p
                 join lateral (select min(v.price_minor) as min_price, max(v.price_minor) as max_price, min(v.currency) as currency,
                        (array_agg(v.id order by v.price_minor, v.position))[1] as cheapest,
                        bool_or(not v.track_inventory or v.allow_backorder or coalesce(i.on_hand - i.reserved, 0) > 0) as available
                        from product_variants v left join inventory_items i on i.variant_id = v.id where v.product_id = p.id) a on true
                 left join brands b on b.id = p.brand_id
                """;
        Long total = jdbc.queryForObject("select count(*)" + from + where, Long.class, args.toArray());
        String order = switch (sort == null ? Sort.NEWEST : sort) {
            case NEWEST -> "coalesce(p.published_at, p.created_at) desc";
            case PRICE_ASC -> "a.min_price asc";
            case PRICE_DESC -> "a.min_price desc";
            case NAME -> "lower(p.name) asc";
        };
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        boolean gross = stores.currentSettings().pricesIncludeTax();
        record Raw(UUID id, String slug, String name, String brand, long min, long max, String currency, UUID cheapest, boolean available, int vat) {
        }
        List<Raw> raws = jdbc.query("select p.id, p.slug, p.name, p.vat_rate_bps, b.name as brand, a.*" + from + where
                + " order by " + order + ", p.id limit ? offset ?", (rs, i) -> new Raw(rs.getObject("id", UUID.class), rs.getString("slug"),
                rs.getString("name"), rs.getString("brand"), rs.getLong("min_price"), rs.getLong("max_price"), rs.getString("currency"),
                rs.getObject("cheapest", UUID.class), rs.getBoolean("available"), rs.getInt("vat_rate_bps")), pageArgs.toArray());
        Map<UUID, List<Media.ImageView>> images = media.list(Products.IMAGE_OWNER, raws.stream().map(Raw::id).toList());
        Map<UUID, Long> compareAt = new HashMap<>();
        List<UUID> cheapest = raws.stream().map(Raw::cheapest).toList();
        if (!cheapest.isEmpty()) {
            jdbc.query("select id, compare_at_minor from product_variants where tenant_id = ? and id = any(?) and compare_at_minor is not null",
                    rs -> {
                        compareAt.put(rs.getObject(1, UUID.class), rs.getLong(2));
                    }, tenant, cheapest.toArray(UUID[]::new));
        }
        Map<UUID, Long> lowest = prices.lowestBeforeCurrent(cheapest);
        List<ProductCard> cards = raws.stream().map(r -> {
            var img = images.getOrDefault(r.id(), List.of());
            Long cmp = compareAt.get(r.cheapest());
            return new ProductCard(r.id(), r.slug(), r.name(), r.brand(), gross(r.min(), r.vat(), gross), gross(r.max(), r.vat(), gross),
                    cmp == null ? null : gross(cmp, r.vat(), gross), cmp == null || lowest.get(r.cheapest()) == null ? null : gross(lowest.get(r.cheapest()), r.vat(), gross),
                    r.currency(), r.available(), img.isEmpty() ? null : img.getFirst().urls().get("w400"),
                    img.isEmpty() ? null : img.getFirst().alt());
        }).toList();
        return new PageImpl<>(cards, pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public PublicProduct product(String slug) {
        UUID tenant = TenantContext.requireTenantId();
        record Head(UUID id, String slug, String name, String description, String brand, ProductType type, int vat, String options,
                String seoTitle, String seoDescription, Instant updatedAt) {
        }
        Head h = jdbc.query("""
                select p.*, b.name as brand from products p left join brands b on b.id = p.brand_id
                where p.tenant_id = ? and p.slug = ? and p.status = 'ACTIVE'
                """, (rs, i) -> new Head(rs.getObject("id", UUID.class), rs.getString("slug"), rs.getString("name"),
                rs.getString("description"), rs.getString("brand"), ProductType.valueOf(rs.getString("type")), rs.getInt("vat_rate_bps"),
                rs.getString("options_json"), rs.getString("seo_title"), rs.getString("seo_description"),
                rs.getTimestamp("updated_at").toInstant()), tenant, slug).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Nie znaleziono produktu."));
        boolean gross = stores.currentSettings().pricesIncludeTax();
        record V(UUID id, String values, String sku, long price, Long compareAt, boolean track, boolean backorder, Integer available, String currency) {
        }
        List<V> vs = jdbc.query("""
                select v.*, i.on_hand - i.reserved as avail from product_variants v left join inventory_items i on i.variant_id = v.id
                where v.tenant_id = ? and v.product_id = ? order by v.position
                """, (rs, i) -> new V(rs.getObject("id", UUID.class), rs.getString("option_values_json"), rs.getString("sku"),
                rs.getLong("price_minor"), rs.getObject("compare_at_minor") == null ? null : rs.getLong("compare_at_minor"),
                rs.getBoolean("track_inventory"), rs.getBoolean("allow_backorder"),
                rs.getObject("avail") == null ? null : rs.getInt("avail"), rs.getString("currency")), tenant, h.id());
        Map<UUID, Long> lowest = prices.lowestBeforeCurrent(vs.stream().map(V::id).toList());
        List<PublicVariant> variants = vs.stream().map(v -> {
            Map<String, String> values = json.readValue(v.values(), new TypeReference<LinkedHashMap<String, String>>() { });
            boolean available = !v.track() || v.backorder() || (v.available() != null && v.available() > 0);
            boolean low = v.track() && !v.backorder() && v.available() != null && v.available() > 0 && v.available() <= LOW_STOCK;
            return new PublicVariant(v.id(), values, String.join(" / ", values.values()), v.sku(), gross(v.price(), h.vat(), gross),
                    v.compareAt() == null ? null : gross(v.compareAt(), h.vat(), gross),
                    v.compareAt() == null || lowest.get(v.id()) == null ? null : gross(lowest.get(v.id()), h.vat(), gross), available, low);
        }).toList();
        List<Crumb> crumbs = breadcrumbs(h.id());
        return new PublicProduct(h.id(), h.slug(), h.name(), h.description(), h.brand(), h.type(), h.vat(),
                vs.isEmpty() ? "PLN" : vs.getFirst().currency(),
                json.readValue(h.options(), new TypeReference<List<CatalogViews.OptionView>>() { }), variants,
                media.list(Products.IMAGE_OWNER, List.of(h.id())).getOrDefault(h.id(), List.of()), crumbs, h.seoTitle(),
                h.seoDescription(), h.updatedAt());
    }

    /** Path of the product's deepest visible category (for breadcrumbs and BreadcrumbList structured data). */
    private List<Crumb> breadcrumbs(UUID productId) {
        Map<UUID, PublicCategory> visible = new HashMap<>();
        categories().forEach(c -> visible.put(c.id(), c));
        List<String> paths = jdbc.query("""
                select c.path from product_categories pc join categories c on c.id = pc.category_id
                where pc.tenant_id = ? and pc.product_id = ? order by c.depth desc, c.path limit 5
                """, (rs, i) -> rs.getString(1), TenantContext.requireTenantId(), productId);
        for (String path : paths) {
            List<Crumb> crumbs = new ArrayList<>();
            boolean ok = true;
            for (String id : path.split("/")) {
                if (id.isEmpty()) continue;
                PublicCategory c = visible.get(UUID.fromString(id));
                if (c == null) {
                    ok = false;
                    break;
                }
                crumbs.add(new Crumb(c.name(), c.slug()));
            }
            if (ok) return crumbs;
        }
        return List.of();
    }

    @Transactional(readOnly = true)
    public List<SitemapEntry> sitemap() {
        List<SitemapEntry> entries = new ArrayList<>();
        categories().forEach(c -> entries.add(new SitemapEntry("/kategoria/" + c.slug(), null)));
        jdbc.query("select slug, updated_at from products where tenant_id = ? and status = 'ACTIVE' order by updated_at desc limit 20000",
                rs -> {
                    entries.add(new SitemapEntry("/produkt/" + rs.getString(1), rs.getTimestamp(2).toInstant()));
                }, TenantContext.requireTenantId());
        return entries;
    }

    static long gross(Long amount, int vatBps, boolean pricesIncludeTax) {
        if (amount == null) return 0;
        return pricesIncludeTax ? amount : Math.round(amount * (10_000 + vatBps) / 10_000.0);
    }
}

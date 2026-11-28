package pl.shopivo.recommendations;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.catalog.PublicCatalog;
import pl.shopivo.catalog.PublicCatalog.ProductCard;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Ranks products from the store's own data. Every list contains only active, available products; rankings (id lists)
 * are cached for two minutes per store (dropped at once when an order is placed or cancelled), while prices and
 * availability always come fresh from the catalogue.
 * When a store has too little history, lists are topped up with newest products, so a section is never empty.
 */
@Service
public class Recommendations {

    /** Ready-made lists for home-page sections, menus and landing pages. */
    public enum Source {
        BESTSELLERS("bestsellery"), DEALS("promocje"), LAST_PIECES("koncowki"), NEWEST("nowosci"), TOP_RATED("najlepiej-oceniane"),
        BACK_IN_STOCK("wracaja");

        public final String slug;

        Source(String slug) {
            this.slug = slug;
        }

        public static Source of(String slug) {
            for (Source s : values()) if (s.slug.equals(slug) || s.name().equalsIgnoreCase(slug)) return s;
            throw new NotFoundException("Nieznana lista produktów.");
        }
    }

    public static final int MAX = 24;
    /** "Last pieces": at most this many in stock (matches the "ostatnie sztuki" label on the product page). */
    static final int LAST_PIECES = 3;
    /** Bestseller weights halve every week; sales older than 60 days are ignored. */
    static final double HALF_LIFE_DAYS = 7;
    /** Bayesian prior for ratings: a product needs reviews to beat the store's average. */
    static final int RATING_PRIOR = 3;

    private final JdbcTemplate jdbc;
    private final PublicCatalog catalog;
    private final Cache<String, List<UUID>> rankings = Caffeine.newBuilder().expireAfterWrite(Duration.ofMinutes(2)).maximumSize(20_000).build();

    Recommendations(JdbcTemplate jdbc, PublicCatalog catalog) {
        this.jdbc = jdbc;
        this.catalog = catalog;
    }

    /** A new or cancelled order changes the rankings of that store at once (stock and catalogue changes within 2 min). */
    @org.springframework.transaction.event.TransactionalEventListener(fallbackExecution = true)
    void onPlaced(pl.shopivo.orders.OrderEvents.OrderPlaced e) {
        forget(e.tenantId());
    }

    @org.springframework.transaction.event.TransactionalEventListener(fallbackExecution = true)
    void onCanceled(pl.shopivo.orders.OrderEvents.OrderCanceled e) {
        forget(e.tenantId());
    }

    private void forget(UUID tenant) {
        String prefix = tenant + "|";
        rankings.asMap().keySet().removeIf(k -> k.startsWith(prefix));
    }

    // ------------------------------------------------------------------------------------------------ lists

    @Transactional(readOnly = true)
    public List<ProductCard> list(Source source, String categorySlug, int limit) {
        int n = Math.max(1, Math.min(limit, MAX));
        UUID tenant = TenantContext.requireTenantId();
        String path = categoryPath(categorySlug);
        List<UUID> ranked = cached(tenant + "|" + source + "|" + path, () -> rank(source, tenant, path));
        // Deals, last pieces and back-in-stock are promises: never padded with products that are not.
        boolean pad = source == Source.BESTSELLERS || source == Source.TOP_RATED || source == Source.NEWEST;
        return available(ranked, n, pad ? newest(tenant, path) : List.of());
    }

    private List<UUID> rank(Source source, UUID tenant, String path) {
        String inCategory = path == null ? "" : " and exists (select 1 from product_categories pc join categories c on c.id = pc.category_id"
                + " where pc.product_id = p.id and c.path like ? || '%')";
        List<Object> args = new ArrayList<>(List.of(tenant));
        String sql = switch (source) {
            // Units sold in orders that were not cancelled, each weighted by its age (exponential decay)
            case BESTSELLERS -> """
                    select p.id from products p
                    join (select oi.product_id, sum(oi.quantity * power(0.5, extract(epoch from now() - o.created_at) / 86400.0 / %s)) as score
                          from order_items oi join orders o on o.id = oi.order_id
                          where oi.tenant_id = ? and o.status <> 'CANCELED' and o.created_at > now() - interval '60 days'
                          group by oi.product_id) s on s.product_id = p.id
                    where p.tenant_id = ? and p.status = 'ACTIVE'%s order by s.score desc, p.id limit 100
                    """.formatted(HALF_LIFE_DAYS, inCategory);
            // Biggest real discount first (current price vs. "before discount" price of the variant)
            case DEALS -> """
                    select p.id from products p
                    join (select v.product_id, max((v.compare_at_minor - v.price_minor)::numeric / v.compare_at_minor) as off
                          from product_variants v where v.tenant_id = ? and v.compare_at_minor > v.price_minor group by v.product_id) d on d.product_id = p.id
                    where p.tenant_id = ? and p.status = 'ACTIVE'%s order by d.off desc, p.id limit 100
                    """.formatted(inCategory);
            // Few pieces left (tracked stock, no backorders), most recently selling first
            case LAST_PIECES -> """
                    select p.id from products p
                    join (select v.product_id, sum(greatest(i.on_hand - i.reserved, 0)) as left_qty, bool_or(not v.track_inventory or v.allow_backorder) as unlimited
                          from product_variants v left join inventory_items i on i.variant_id = v.id where v.tenant_id = ? group by v.product_id) st on st.product_id = p.id
                    left join (select oi.product_id, max(o.created_at) as last_sale from order_items oi join orders o on o.id = oi.order_id
                               where oi.tenant_id = ? and o.status <> 'CANCELED' group by oi.product_id) ls on ls.product_id = p.id
                    where p.tenant_id = ? and p.status = 'ACTIVE' and not st.unlimited and st.left_qty between 1 and %d%s
                    order by ls.last_sale desc nulls last, st.left_qty, p.id limit 100
                    """.formatted(LAST_PIECES, inCategory);
            case NEWEST -> """
                    select p.id from products p where p.tenant_id = ? and p.status = 'ACTIVE'%s
                    order by coalesce(p.published_at, p.created_at) desc, p.id limit 100
                    """.formatted(inCategory);
            // Bayesian average of approved reviews: (prior × store mean + sum) / (prior + count)
            case TOP_RATED -> """
                    with r as (select product_id, count(*) as n, sum(rating) as total from product_reviews
                               where tenant_id = ? and status = 'APPROVED' group by product_id),
                         m as (select coalesce(sum(total)::numeric / nullif(sum(n), 0), 4) as mean from r)
                    select p.id from products p join r on r.product_id = p.id cross join m
                    where p.tenant_id = ? and p.status = 'ACTIVE'%s
                    order by (%d * m.mean + r.total) / (%d + r.n) desc, r.n desc, p.id limit 100
                    """.formatted(inCategory, RATING_PRIOR, RATING_PRIOR);
            // Stock went from zero to positive in the last 14 days
            case BACK_IN_STOCK -> """
                    select p.id from products p
                    join (select v.product_id, max(m.created_at) as at from inventory_movements m join product_variants v on v.id = m.variant_id
                          where m.tenant_id = ? and m.created_at > now() - interval '14 days' and m.delta > 0
                            and m.on_hand_after > 0 and m.on_hand_after - m.delta <= 0 and m.reason <> 'INITIAL'
                          group by v.product_id) b on b.product_id = p.id
                    where p.tenant_id = ? and p.status = 'ACTIVE'%s order by b.at desc, p.id limit 100
                    """.formatted(inCategory);
        };
        int tenants = (int) sql.chars().filter(ch -> ch == '?').count() - (path == null ? 0 : 1);
        for (int i = 1; i < tenants; i++) args.add(tenant);
        if (path != null) args.add(path);
        return jdbc.queryForList(sql, UUID.class, args.toArray());
    }

    // ------------------------------------------------------------------------------------------------ product

    /**
     * Products bought together with this one. Score = co-occurrences / √(orders with the other product): frequent
     * pairs win, but a store-wide bestseller does not appear everywhere just because it is in many baskets.
     * Only real pairs — never padded, so the "bought together" label stays true (use {@link #similar} next to it).
     */
    @Transactional(readOnly = true)
    public List<ProductCard> boughtTogether(String slug, int limit) {
        int n = Math.max(1, Math.min(limit, 12));
        UUID tenant = TenantContext.requireTenantId();
        UUID id = productId(slug);
        List<UUID> ranked = pl.shopivo.shared.cache.Caches.get(rankings, tenant + "|bt|" + id, k -> jdbc.queryForList("""
                with mine as (select distinct oi.order_id from order_items oi join orders o on o.id = oi.order_id
                              where oi.tenant_id = ? and oi.product_id = ? and o.status <> 'CANCELED' and o.created_at > now() - interval '365 days'),
                     pairs as (select oi.product_id, count(distinct oi.order_id) as together from order_items oi
                               where oi.tenant_id = ? and oi.order_id in (select order_id from mine) and oi.product_id <> ? group by oi.product_id),
                     popularity as (select oi.product_id, count(distinct oi.order_id) as orders from order_items oi join orders o on o.id = oi.order_id
                                    where oi.tenant_id = ? and o.status <> 'CANCELED' and o.created_at > now() - interval '365 days'
                                      and oi.product_id in (select product_id from pairs) group by oi.product_id)
                select pairs.product_id from pairs join popularity using (product_id)
                order by pairs.together / sqrt(popularity.orders) desc, pairs.together desc, pairs.product_id limit 50
                """, UUID.class, tenant, id, tenant, id, tenant));
        List<UUID> out = new ArrayList<>(ranked);
        out.remove(id);
        return available(out, n, List.of());
    }

    /** Same categories first, then a close price (±30% counts most), then the same brand. */
    @Transactional(readOnly = true)
    public List<ProductCard> similar(String slug, int limit) {
        int n = Math.max(1, Math.min(limit, 12));
        UUID tenant = TenantContext.requireTenantId();
        UUID id = productId(slug);
        return available(similarIds(tenant, id), n, newest(tenant, null).stream().filter(x -> !x.equals(id)).toList());
    }

    private List<UUID> similarIds(UUID tenant, UUID id) {
        return pl.shopivo.shared.cache.Caches.get(rankings, tenant + "|sim|" + id, k -> jdbc.queryForList("""
                with me as (select p.id, p.brand_id, (select min(price_minor) from product_variants where product_id = p.id) as price
                            from products p where p.tenant_id = ? and p.id = ?),
                     my_cats as (select category_id from product_categories where product_id = ?)
                select p.id from products p cross join me
                join lateral (select min(price_minor) as price from product_variants where product_id = p.id) pr on true
                left join lateral (select count(*) as shared from product_categories pc where pc.product_id = p.id
                                   and pc.category_id in (select category_id from my_cats)) c on true
                where p.tenant_id = ? and p.status = 'ACTIVE' and p.id <> me.id and (c.shared > 0 or p.brand_id = me.brand_id)
                order by c.shared desc,
                         abs(ln(greatest(pr.price, 1)::numeric / greatest(me.price, 1))) < 0.27 desc,
                         abs(ln(greatest(pr.price, 1)::numeric / greatest(me.price, 1))),
                         (p.brand_id is not distinct from me.brand_id) desc, p.id
                limit 50
                """, UUID.class, tenant, id, id, tenant));
    }

    // ------------------------------------------------------------------------------------------------ cart

    /**
     * Suggestions for a cart: products bought together with what is in it or from the same categories, preferring
     * prices that close the gap to free delivery ({@code missingMinor}, gross) without overshooting it by much.
     */
    @Transactional(readOnly = true)
    public List<ProductCard> cartComplements(List<UUID> inCart, Long missingMinor, int limit) {
        int n = Math.max(1, Math.min(limit, 12));
        UUID tenant = TenantContext.requireTenantId();
        List<UUID> cart = inCart == null ? List.of() : inCart.stream().distinct().limit(30).toList();
        if (cart.isEmpty()) return list(Source.BESTSELLERS, null, n);
        UUID[] ids = cart.toArray(UUID[]::new);
        List<UUID> affinity = jdbc.queryForList("""
                with baskets as (select distinct oi.order_id from order_items oi join orders o on o.id = oi.order_id
                                 where oi.tenant_id = ? and oi.product_id = any(?) and o.status <> 'CANCELED' and o.created_at > now() - interval '365 days'),
                     together as (select oi.product_id, count(distinct oi.order_id) as score from order_items oi
                                  where oi.tenant_id = ? and oi.order_id in (select order_id from baskets) and not (oi.product_id = any(?)) group by oi.product_id),
                     related as (select pc.product_id, count(*) * 0.5 as score from product_categories pc
                                 where pc.category_id in (select category_id from product_categories where product_id = any(?)) and not (pc.product_id = any(?))
                                 group by pc.product_id)
                select p.id from products p
                left join together t on t.product_id = p.id left join related r on r.product_id = p.id
                where p.tenant_id = ? and p.status = 'ACTIVE' and not (p.id = any(?)) and (t.score is not null or r.score is not null)
                order by coalesce(t.score, 0) * 2 + coalesce(r.score, 0) desc, p.id limit 60
                """, UUID.class, tenant, ids, tenant, ids, ids, ids, tenant, ids);
        List<UUID> pool = new ArrayList<>(new LinkedHashSet<>(affinity));
        for (UUID b : list(Source.BESTSELLERS, null, MAX).stream().map(ProductCard::id).toList()) if (!cart.contains(b) && !pool.contains(b)) pool.add(b);
        List<ProductCard> cards = catalog.cards(pool).stream().filter(ProductCard::available).toList();
        if (missingMinor == null || missingMinor <= 0) return cards.stream().limit(n).toList();
        long gap = missingMinor;
        // Rank: first prices that close the gap without exceeding 1.5×, by how close they are; then the rest by affinity
        List<ProductCard> closing = cards.stream().filter(c -> c.priceMinor() >= gap && c.priceMinor() <= gap * 3 / 2)
                .sorted(Comparator.comparingLong(c -> c.priceMinor() - gap)).toList();
        List<ProductCard> out = new ArrayList<>(closing);
        for (ProductCard c : cards) if (!out.contains(c)) out.add(c);
        return out.stream().limit(n).toList();
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private List<ProductCard> available(List<UUID> ranked, int n, List<UUID> padding) {
        List<UUID> ids = new ArrayList<>(ranked);
        for (UUID p : padding) if (!ids.contains(p)) ids.add(p);
        return catalog.cards(ids.stream().limit(60).toList()).stream().filter(ProductCard::available).limit(n).toList();
    }

    private List<UUID> newest(UUID tenant, String path) {
        return cached(tenant + "|" + Source.NEWEST + "|" + path, () -> rank(Source.NEWEST, tenant, path));
    }

    /**
     * Empty rankings are not cached: in a new store the first products (e.g. imported examples) must appear at once,
     * not after the cache expires. A non-empty list may lag behind catalogue changes by up to 2 minutes.
     */
    private List<UUID> cached(String key, java.util.function.Supplier<List<UUID>> rank) {
        List<UUID> hit = pl.shopivo.shared.cache.Caches.get(rankings, key, k -> {
            List<UUID> r = rank.get();
            return r.isEmpty() ? null : r;
        });
        return hit == null ? List.of() : hit;
    }

    private UUID productId(String slug) {
        return jdbc.queryForList("select id from products where tenant_id = ? and slug = ? and status = 'ACTIVE'", UUID.class,
                TenantContext.requireTenantId(), slug).stream().findFirst().orElseThrow(() -> new NotFoundException("Nie znaleziono produktu."));
    }

    /** Materialised path of a visible category (null = whole store). */
    private String categoryPath(String slug) {
        if (slug == null || slug.isBlank()) return null;
        String s = slug.strip().toLowerCase(Locale.ROOT);
        boolean visible = catalog.categories().stream().anyMatch(c -> c.slug().equals(s));
        if (!visible) throw new NotFoundException("Nie znaleziono kategorii.");
        return jdbc.queryForObject("select path from categories where tenant_id = ? and slug = ?", String.class, TenantContext.requireTenantId(), s);
    }
}

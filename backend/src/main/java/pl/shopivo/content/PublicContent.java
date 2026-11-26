package pl.shopivo.content;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;

/** Read model of pages and posts for the storefront: published only (drafts only in a signed preview). */
@Service
public class PublicContent {

    private final JdbcTemplate jdbc;

    PublicContent(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record PublicEntry(ContentKind kind, LegalKey systemKey, String slug, String title, String excerpt, String body,
            String seoTitle, String seoDescription, Instant publishedAt, Instant updatedAt, boolean draft) {
    }

    public record PostCard(String slug, String title, String excerpt, Instant publishedAt) {
    }

    public record Link(String title, String path, LegalKey systemKey) {
    }

    public record SitemapEntry(String path, Instant lastModified) {
    }

    @Transactional(readOnly = true)
    public PublicEntry entry(ContentKind kind, String slug, boolean preview) {
        if (slug == null || slug.length() > 140) throw new NotFoundException();
        return jdbc.query("select * from content_entries where tenant_id = ? and kind = ? and slug = ?" + (preview ? "" : " and status = 'PUBLISHED'"),
                (rs, i) -> {
                    String key = rs.getString("system_key");
                    return new PublicEntry(kind, key == null ? null : LegalKey.valueOf(key), rs.getString("slug"), rs.getString("title"),
                            rs.getString("excerpt"), rs.getString("body"), rs.getString("seo_title"), rs.getString("seo_description"),
                            Content.instant(rs, "published_at"), Content.instant(rs, "updated_at"), "DRAFT".equals(rs.getString("status")));
                }, TenantContext.requireTenantId(), kind.name(), slug).stream().findFirst()
                .orElseThrow(() -> new NotFoundException(kind == ContentKind.PAGE ? "Nie znaleziono strony." : "Nie znaleziono wpisu."));
    }

    @Transactional(readOnly = true)
    public Page<PostCard> posts(Pageable pageable) {
        UUID tenant = TenantContext.requireTenantId();
        Long total = jdbc.queryForObject("select count(*) from content_entries where tenant_id = ? and kind = 'POST' and status = 'PUBLISHED'",
                Long.class, tenant);
        List<PostCard> items = jdbc.query("""
                select slug, title, coalesce(excerpt, left(body, 240)) as excerpt, published_at from content_entries
                where tenant_id = ? and kind = 'POST' and status = 'PUBLISHED' order by published_at desc, id limit ? offset ?
                """, (rs, i) -> new PostCard(rs.getString(1), rs.getString(2), rs.getString(3), Content.instant(rs, "published_at")),
                tenant, pageable.getPageSize(), pageable.getOffset());
        return new PageImpl<>(items, pageable, total == null ? 0 : total);
    }

    /** Footer links: legal documents first (fixed order), then pages marked for the footer. */
    @Transactional(readOnly = true)
    public List<Link> footerLinks() {
        return jdbc.query("""
                select title, slug, system_key from content_entries
                where tenant_id = ? and kind = 'PAGE' and status = 'PUBLISHED' and (show_in_footer or system_key is not null)
                order by case system_key when 'TERMS' then 0 when 'PRIVACY' then 1 when 'RETURNS' then 2 when 'SHIPPING' then 3 else 4 end, title
                limit 30
                """, (rs, i) -> new Link(rs.getString(1), ContentKind.PAGE.pathPrefix() + rs.getString(2),
                rs.getString(3) == null ? null : LegalKey.valueOf(rs.getString(3))), TenantContext.requireTenantId());
    }

    @Transactional(readOnly = true)
    public boolean hasPosts() {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from content_entries where tenant_id = ? and kind = 'POST' and status = 'PUBLISHED')", Boolean.class,
                TenantContext.requireTenantId()));
    }

    @Transactional(readOnly = true)
    public List<SitemapEntry> sitemap() {
        return jdbc.query("select kind, slug, updated_at from content_entries where tenant_id = ? and status = 'PUBLISHED' order by updated_at desc limit 5000",
                (rs, i) -> new SitemapEntry(ContentKind.valueOf(rs.getString(1)).pathPrefix() + rs.getString(2), Content.instant(rs, "updated_at")),
                TenantContext.requireTenantId());
    }

    /** The text of a published revision (e.g. the terms accepted with an order). */
    @Transactional(readOnly = true)
    public Optional<PublicEntry> revision(UUID revisionId) {
        return jdbc.query("select title, body, published_at from content_revisions where id = ? and tenant_id = ?",
                (rs, i) -> new PublicEntry(ContentKind.PAGE, null, null, rs.getString(1), null, rs.getString(2), null, null,
                        Content.instant(rs, "published_at"), Content.instant(rs, "published_at"), false),
                revisionId, TenantContext.requireTenantId()).stream().findFirst();
    }
}

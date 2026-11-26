package pl.shopivo.content;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.content.internal.LegalTemplates;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.web.Slugs;
import pl.shopivo.stores.StoreStatus;
import pl.shopivo.stores.Stores;

/** Pages and blog posts of the current store (merchant panel). */
@Service
public class Content {

    static final int MAX_ENTRIES = 1000;

    private final JdbcTemplate jdbc;
    private final Redirects redirects;
    private final Stores stores;
    private final LegalTemplates templates;
    private final AuditLog auditLog;

    Content(JdbcTemplate jdbc, Redirects redirects, Stores stores, LegalTemplates templates, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.redirects = redirects;
        this.stores = stores;
        this.templates = templates;
        this.auditLog = auditLog;
    }

    public enum Status { DRAFT, PUBLISHED }

    public record EntryInput(ContentKind kind, String title, String slug, String excerpt, String body, Status status,
            Boolean showInFooter, String seoTitle, String seoDescription, long version) {
    }

    public record EntrySummary(UUID id, ContentKind kind, LegalKey systemKey, String slug, String path, String title, Status status,
            boolean showInFooter, Instant publishedAt, Instant updatedAt) {
    }

    public record EntryView(UUID id, ContentKind kind, LegalKey systemKey, String slug, String path, String title, String excerpt,
            String body, Status status, boolean showInFooter, String seoTitle, String seoDescription, Instant publishedAt,
            int publishedRevision, Instant updatedAt, long version) {
    }

    @Transactional(readOnly = true)
    public Page<EntrySummary> list(ContentKind kind, String query, Pageable pageable) {
        UUID tenant = TenantContext.requireTenantId();
        StringBuilder where = new StringBuilder(" where tenant_id = ? and kind = ?");
        List<Object> args = new ArrayList<>(List.of(tenant, kind.name()));
        if (query != null && !query.isBlank()) {
            String q = query.strip();
            if (q.length() > 100) q = q.substring(0, 100);
            where.append(" and lower(title) like ?");
            args.add("%" + q.toLowerCase(java.util.Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        Long total = jdbc.queryForObject("select count(*) from content_entries" + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        List<EntrySummary> items = jdbc.query("select * from content_entries" + where
                + " order by (system_key is null), coalesce(published_at, created_at) desc, id limit ? offset ?",
                (rs, i) -> summary(rs), pageArgs.toArray());
        return new PageImpl<>(items, pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public EntryView get(UUID id) {
        return find(id).orElseThrow(() -> new NotFoundException("Nie znaleziono strony."));
    }

    @Transactional
    public EntryView create(EntryInput in) {
        UUID tenant = TenantContext.requireTenantId();
        if (in.kind() == null) throw new BusinessRuleException("INVALID_KIND", "Wybierz rodzaj: strona lub wpis.");
        Integer count = jdbc.queryForObject("select count(*) from content_entries where tenant_id = ?", Integer.class, tenant);
        if (count != null && count >= MAX_ENTRIES) {
            throw new BusinessRuleException("TOO_MANY_ENTRIES", "Sklep może mieć najwyżej " + MAX_ENTRIES + " stron i wpisów.");
        }
        Clean c = clean(in);
        String slug = uniqueSlug(in.kind(), in.slug() == null || in.slug().isBlank() ? c.title() : in.slug(), null,
                in.slug() != null && !in.slug().isBlank());
        UUID id = UuidV7.generate();
        jdbc.update("""
                insert into content_entries (id, tenant_id, kind, slug, title, excerpt, body, status, show_in_footer, seo_title, seo_description)
                values (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)
                """, id, tenant, in.kind().name(), slug, c.title(), c.excerpt(), c.body(), c.showInFooter(), c.seoTitle(), c.seoDescription());
        if (in.status() == Status.PUBLISHED) publish(id);
        auditLog.record(AuditEntry.tenant("content.created", tenant, "content", id).with(Map.of("title", c.title())));
        return get(id);
    }

    @Transactional
    public EntryView update(UUID id, EntryInput in) {
        UUID tenant = TenantContext.requireTenantId();
        EntryView current = lock(id);
        if (current.version() != in.version()) {
            throw new ConflictException("VERSION_CONFLICT", "Strona została w międzyczasie zmieniona. Odśwież widok.");
        }
        Clean c = clean(in);
        String slug = in.slug() == null || in.slug().isBlank() ? current.slug() : uniqueSlug(current.kind(), in.slug(), id, true);
        Status status = in.status() == null ? current.status() : in.status();
        if (status == Status.DRAFT && current.status() == Status.PUBLISHED) guardLegalStaysOnline(current);
        jdbc.update("""
                update content_entries set slug = ?, title = ?, excerpt = ?, body = ?, show_in_footer = ?, seo_title = ?, seo_description = ?,
                    status = case when ? = 'DRAFT' then 'DRAFT' else status end, updated_at = now(), version = version + 1
                where id = ? and tenant_id = ?
                """, slug, c.title(), c.excerpt(), c.body(), c.showInFooter(), c.seoTitle(), c.seoDescription(), status.name(), id, tenant);
        if (status == Status.PUBLISHED) publish(id);
        if (!slug.equals(current.slug()) && current.status() == Status.PUBLISHED) {
            redirects.pathChanged(current.kind().pathPrefix() + current.slug(), current.kind().pathPrefix() + slug);
        }
        auditLog.record(AuditEntry.tenant("content.updated", tenant, "content", id).with(Map.of("status", status.name())));
        return get(id);
    }

    @Transactional
    public void delete(UUID id) {
        UUID tenant = TenantContext.requireTenantId();
        EntryView current = lock(id);
        if (current.status() == Status.PUBLISHED) guardLegalStaysOnline(current);
        // Revisions stay: orders keep pointing at the terms the customer accepted.
        jdbc.update("delete from content_entries where id = ? and tenant_id = ?", id, tenant);
        auditLog.record(AuditEntry.tenant("content.deleted", tenant, "content", id).with(Map.of("title", current.title())));
    }

    /** Creates a legal document from the template, filled with the store's data, as a draft to review. */
    @Transactional
    public EntryView createLegal(LegalKey key) {
        UUID tenant = TenantContext.requireTenantId();
        Boolean exists = jdbc.queryForObject("select exists(select 1 from content_entries where tenant_id = ? and system_key = ?)",
                Boolean.class, tenant, key.name());
        if (Boolean.TRUE.equals(exists)) {
            throw new ConflictException("LEGAL_PAGE_EXISTS", "Ta strona już istnieje — edytuj ją na liście stron.");
        }
        String slug = uniqueSlug(ContentKind.PAGE, key.slug(), null, false);
        UUID id = UuidV7.generate();
        jdbc.update("""
                insert into content_entries (id, tenant_id, kind, system_key, slug, title, body, status, show_in_footer)
                values (?, ?, 'PAGE', ?, ?, ?, ?, 'DRAFT', true)
                """, id, tenant, key.name(), slug, key.title(), templates.render(key));
        auditLog.record(AuditEntry.tenant("content.legal.created", tenant, "content", id).with(Map.of("key", key.name())));
        return get(id);
    }

    /** The template for a legal document filled with the current data (to compare with / replace the current text). */
    public String legalTemplate(LegalKey key) {
        return templates.render(key);
    }

    /** Missing-data markers left in each existing legal document. */
    @Transactional(readOnly = true)
    public Map<LegalKey, java.util.List<String>> legalMissing() {
        Map<LegalKey, java.util.List<String>> result = new java.util.EnumMap<>(LegalKey.class);
        jdbc.query("select system_key, body from content_entries where tenant_id = ? and system_key is not null",
                rs -> { result.put(LegalKey.valueOf(rs.getString(1)), LegalSettings.missing(rs.getString(2))); }, TenantContext.requireTenantId());
        return result;
    }

    /** Status of the legal documents (for the panel checklist). */
    @Transactional(readOnly = true)
    public Map<LegalKey, Optional<EntrySummary>> legalStatus() {
        Map<LegalKey, Optional<EntrySummary>> result = new java.util.EnumMap<>(LegalKey.class);
        for (LegalKey k : LegalKey.values()) result.put(k, Optional.empty());
        jdbc.query("select * from content_entries where tenant_id = ? and system_key is not null", rs -> {
            EntrySummary s = summary(rs);
            result.put(s.systemKey(), Optional.of(s));
        }, TenantContext.requireTenantId());
        return result;
    }

    // ------------------------------------------------------------------------------------------------ internals

    /** Marks the entry published; snapshots a new revision when the published text changed (or on first publication). */
    private void publish(UUID id) {
        UUID tenant = TenantContext.requireTenantId();
        record Snapshot(String title, String body, int revision, String status) {
        }
        Snapshot s = jdbc.queryForObject("select title, body, published_revision, status from content_entries where id = ? and tenant_id = ?",
                (rs, i) -> new Snapshot(rs.getString(1), rs.getString(2), rs.getInt(3), rs.getString(4)), id, tenant);
        boolean changed = s.revision() == 0 || "DRAFT".equals(s.status()) || jdbc.queryForObject("""
                select not exists(select 1 from content_revisions where entry_id = ? and tenant_id = ? and revision = ? and title = ? and body = ?)
                """, Boolean.class, id, tenant, s.revision(), s.title(), s.body());
        if (changed) {
            int next = s.revision() + 1;
            jdbc.update("insert into content_revisions (id, tenant_id, entry_id, revision, title, body, published_by) values (?, ?, ?, ?, ?, ?, ?)",
                    UuidV7.generate(), tenant, id, next, s.title(), s.body(),
                    SecurityUtils.currentUser().map(u -> u.id()).orElse(null));
            jdbc.update("update content_entries set published_revision = ? where id = ? and tenant_id = ?", next, id, tenant);
        }
        jdbc.update("update content_entries set status = 'PUBLISHED', published_at = coalesce(published_at, now()) where id = ? and tenant_id = ?",
                id, tenant);
    }

    private void guardLegalStaysOnline(EntryView e) {
        if (e.systemKey() != null && e.systemKey().requiredForPublish() && stores.current().status() == StoreStatus.PUBLISHED) {
            throw new BusinessRuleException("LEGAL_PAGE_REQUIRED",
                    "„" + e.systemKey().title() + "” musi być dostępny, dopóki sklep jest opublikowany. Możesz go edytować.");
        }
    }

    private EntryView lock(UUID id) {
        jdbc.query("select id from content_entries where id = ? and tenant_id = ? for update", rs -> { }, id, TenantContext.requireTenantId());
        return get(id);
    }

    private Optional<EntryView> find(UUID id) {
        return jdbc.query("select * from content_entries where id = ? and tenant_id = ?", (rs, i) -> view(rs), id,
                TenantContext.requireTenantId()).stream().findFirst();
    }

    private String uniqueSlug(ContentKind kind, String raw, UUID self, boolean explicit) {
        String base = Slugs.slugify(raw);
        if (base.isEmpty()) base = kind == ContentKind.PAGE ? "strona" : "wpis";
        if (base.length() > 120) base = base.substring(0, 120).replaceAll("-+$", "");
        UUID tenant = TenantContext.requireTenantId();
        String candidate = base;
        for (int i = 2; ; i++) {
            Boolean taken = jdbc.queryForObject("select exists(select 1 from content_entries where tenant_id = ? and kind = ? and slug = ? and id is distinct from ?)",
                    Boolean.class, tenant, kind.name(), candidate, self);
            if (!Boolean.TRUE.equals(taken)) return candidate;
            if (explicit) throw new ConflictException("SLUG_TAKEN", "Ten adres jest już zajęty.");
            candidate = base + "-" + i;
        }
    }

    record Clean(String title, String excerpt, String body, boolean showInFooter, String seoTitle, String seoDescription) {
    }

    private static Clean clean(EntryInput in) {
        String title = line(in.title(), 200, "Tytuł");
        if (title == null) throw new BusinessRuleException("TITLE_REQUIRED", "Podaj tytuł.");
        String body = in.body() == null ? "" : in.body().replace("\r\n", "\n").replace('\r', '\n');
        if (body.length() > 100_000) throw new BusinessRuleException("BODY_TOO_LONG", "Treść może mieć najwyżej 100 000 znaków.");
        if (body.chars().anyMatch(ch -> ch < 0x20 && ch != '\n' && ch != '\t')) {
            throw new BusinessRuleException("INVALID_CHARACTERS", "Treść zawiera niedozwolone znaki.");
        }
        return new Clean(title, line(in.excerpt(), 300, "Zajawka"), body, Boolean.TRUE.equals(in.showInFooter()),
                line(in.seoTitle(), 200, "Tytuł SEO"), line(in.seoDescription(), 320, "Opis SEO"));
    }

    private static String line(String v, int max, String label) {
        if (v == null || v.isBlank()) return null;
        String s = v.strip().replaceAll("\\s+", " ");
        if (s.length() > max) throw new BusinessRuleException("TOO_LONG", label + ": najwyżej " + max + " znaków.");
        return s;
    }

    static EntrySummary summary(ResultSet rs) throws SQLException {
        ContentKind kind = ContentKind.valueOf(rs.getString("kind"));
        String key = rs.getString("system_key");
        return new EntrySummary(rs.getObject("id", UUID.class), kind, key == null ? null : LegalKey.valueOf(key), rs.getString("slug"),
                kind.pathPrefix() + rs.getString("slug"), rs.getString("title"), Status.valueOf(rs.getString("status")),
                rs.getBoolean("show_in_footer"), instant(rs, "published_at"), instant(rs, "updated_at"));
    }

    private static EntryView view(ResultSet rs) throws SQLException {
        ContentKind kind = ContentKind.valueOf(rs.getString("kind"));
        String key = rs.getString("system_key");
        return new EntryView(rs.getObject("id", UUID.class), kind, key == null ? null : LegalKey.valueOf(key), rs.getString("slug"),
                kind.pathPrefix() + rs.getString("slug"), rs.getString("title"), rs.getString("excerpt"), rs.getString("body"),
                Status.valueOf(rs.getString("status")), rs.getBoolean("show_in_footer"), rs.getString("seo_title"),
                rs.getString("seo_description"), instant(rs, "published_at"), rs.getInt("published_revision"), instant(rs, "updated_at"),
                rs.getLong("version"));
    }

    static Instant instant(ResultSet rs, String column) throws SQLException {
        var ts = rs.getTimestamp(column);
        return ts == null ? null : ts.toInstant();
    }
}

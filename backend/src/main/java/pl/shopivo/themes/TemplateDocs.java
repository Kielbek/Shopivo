package pl.shopivo.themes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.media.Media;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The store's customisation of its template package (engine v2): draft edited in the editor, published version shown
 * to visitors, and every earlier publication for going back. The active template is the theme's code (gallery choice);
 * a document saved for another template is ignored (its defaults apply) until that template is chosen again.
 */
@Service
public class TemplateDocs {

    /** Publications kept per store. */
    static final int KEEP_VERSIONS = 30;

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final TemplatePackages packages;
    private final Themes themes;
    private final ThemeImages images;
    private final AuditLog auditLog;

    TemplateDocs(JdbcTemplate jdbc, JsonMapper json, TemplatePackages packages, Themes themes, ThemeImages images, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.json = json;
        this.packages = packages;
        this.themes = themes;
        this.images = images;
        this.auditLog = auditLog;
    }

    public record State(String code, JsonNode draft, JsonNode published, Instant publishedAt, boolean unpublishedChanges, long version) {
    }

    public record VersionView(UUID id, Instant createdAt) {
    }

    /** What the storefront renders: the template code and the store's document (empty = template defaults). */
    public record Storefront(String code, JsonNode doc) {
    }

    private record Row(String code, String draft, String published, Instant publishedAt, long version) {
    }

    private Row row() {
        return jdbc.query("select template_code, draft_json, published_json, published_at, version from store_templates where tenant_id = ?",
                (rs, i) -> new Row(rs.getString(1), rs.getString(2), rs.getString(3),
                        rs.getTimestamp(4) == null ? null : rs.getTimestamp(4).toInstant(), rs.getLong(5)),
                TenantContext.requireTenantId()).stream().findFirst().orElse(null);
    }

    private ObjectNode empty() {
        return json.createObjectNode();
    }

    /** The template package the store's draft theme points at; only v2 templates have documents. */
    private TemplatePackages.Package active() {
        String code = themes.state().draft().code();
        return packages.get(code).orElseThrow(() -> new BusinessRuleException("NOT_A_TEMPLATE_PACKAGE",
                "Ten szablon nie korzysta z nowego edytora."));
    }

    @Transactional(readOnly = true)
    public State state() {
        TemplatePackages.Package pkg = active();
        Row r = row();
        if (r == null || !r.code().equals(pkg.code())) return new State(pkg.code(), empty(), null, null, true, r == null ? -1 : r.version());
        JsonNode draft = json.readTree(r.draft());
        JsonNode published = r.published() == null ? null : json.readTree(r.published());
        return new State(pkg.code(), draft, published, r.publishedAt(), published == null || !published.equals(draft), r.version());
    }

    private TemplateDocValidator validator(TemplatePackages.Package pkg) {
        Set<UUID> library = images.list().stream().map(Media.ImageView::id).collect(Collectors.toSet());
        return new TemplateDocValidator(pkg, library, json);
    }

    @Transactional
    public State saveDraft(JsonNode doc, long version) {
        TemplatePackages.Package pkg = active();
        ObjectNode clean;
        try {
            clean = validator(pkg).validate(doc);
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleException("INVALID_TEMPLATE_DOC", e.getMessage());
        }
        String text = json.writeValueAsString(clean);
        UUID tenant = TenantContext.requireTenantId();
        // Compare-and-set: two editors cannot overwrite each other's work unknowingly.
        int changed = version < 0
                ? jdbc.update("insert into store_templates (tenant_id, template_code, draft_json) values (?, ?, ?) on conflict (tenant_id) do nothing",
                        tenant, pkg.code(), text)
                : jdbc.update("update store_templates set template_code = ?, draft_json = ?, updated_at = now(), version = version + 1 "
                        + "where tenant_id = ? and version = ?", pkg.code(), text, tenant, version);
        if (changed == 0) throw new ConflictException("VERSION_CONFLICT", "Wygląd sklepu został w międzyczasie zmieniony w innym oknie. Odśwież stronę.");
        return state();
    }

    /** Publishes the draft (and the theme choice itself, so visitors see this template), keeping the previous look. */
    @Transactional
    public State publish(UUID userId) {
        TemplatePackages.Package pkg = active();
        UUID tenant = TenantContext.requireTenantId();
        Row r = row();
        if (r == null || !r.code().equals(pkg.code())) {
            saveDraft(empty(), r == null ? -1 : r.version());
        }
        jdbc.update("update store_templates set published_json = draft_json, published_at = now(), version = version + 1 where tenant_id = ?", tenant);
        jdbc.update("insert into store_template_versions (id, tenant_id, template_code, doc_json, created_by) "
                + "select ?, tenant_id, template_code, draft_json, ? from store_templates where tenant_id = ?", UuidV7.generate(), userId, tenant);
        jdbc.update("""
                delete from store_template_versions where tenant_id = ? and id not in (
                    select id from store_template_versions where tenant_id = ? order by created_at desc limit ?)
                """, tenant, tenant, KEEP_VERSIONS);
        themes.publish();
        auditLog.record(AuditEntry.tenant("template.published", tenant, "template", null).with(Map.of("template", pkg.code())));
        return state();
    }

    @Transactional(readOnly = true)
    public List<VersionView> versions() {
        String code = active().code();
        return jdbc.query("select id, created_at from store_template_versions where tenant_id = ? and template_code = ? order by created_at desc",
                (rs, i) -> new VersionView(rs.getObject(1, UUID.class), rs.getTimestamp(2).toInstant()), TenantContext.requireTenantId(), code);
    }

    /** An earlier publication becomes the draft again (checked against today's schemas); publishing makes it live. */
    @Transactional
    public State restore(UUID versionId, long version) {
        String code = active().code();
        String doc = jdbc.query("select doc_json from store_template_versions where id = ? and tenant_id = ? and template_code = ?",
                (rs, i) -> rs.getString(1), versionId, TenantContext.requireTenantId(), code).stream().findFirst()
                .orElseThrow(NotFoundException::new);
        return saveDraft(json.readTree(doc), version);
    }

    @Transactional(readOnly = true)
    public Storefront storefront(boolean preview) {
        String code = themes.storefront(preview).code();
        if (!packages.has(code)) return new Storefront(code, empty());
        Row r = row();
        if (r == null || !r.code().equalsIgnoreCase(code)) return new Storefront(code, empty());
        String doc = preview ? r.draft() : r.published();
        return new Storefront(code, doc == null ? empty() : json.readTree(doc));
    }
}

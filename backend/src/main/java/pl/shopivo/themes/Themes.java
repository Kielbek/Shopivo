package pl.shopivo.themes;

import java.time.Instant;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.tenancy.TenantContext;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Theme configuration of the current store. */
@Service
public class Themes {

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final AuditLog auditLog;

    Themes(JdbcTemplate jdbc, JsonMapper json, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.json = json;
        this.auditLog = auditLog;
    }

    public record ThemeConfig(String code, Map<String, String> settings) {
    }

    public record ThemeState(ThemeConfig draft, ThemeConfig published, Instant publishedAt, boolean unpublishedChanges, long version) {
    }

    record Row(String draft, String published, Instant publishedAt, long version) {
    }

    @Transactional(readOnly = true)
    public ThemeState state() {
        Row r = row();
        if (r == null) {
            ThemeConfig d = defaults();
            return new ThemeState(d, null, null, true, -1);
        }
        ThemeConfig draft = parse(r.draft());
        ThemeConfig published = r.published() == null ? null : parse(r.published());
        return new ThemeState(draft, published, r.publishedAt(), published == null || !published.equals(draft), r.version());
    }

    @Transactional
    public ThemeState saveDraft(String code, Map<String, String> settings, long version) {
        Map<String, String> valid;
        try {
            valid = ThemeRegistry.validate(code, settings);
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleException("INVALID_THEME", e.getMessage());
        }
        Row current = row();
        long expected = current == null ? -1 : current.version();
        if (expected != version) {
            throw new ConflictException("VERSION_CONFLICT", "Wygląd sklepu został w międzyczasie zmieniony. Odśwież stronę.");
        }
        String draft = json.writeValueAsString(new ThemeConfig(code, valid));
        jdbc.update("""
                insert into store_themes (tenant_id, draft_json) values (?, ?)
                on conflict (tenant_id) do update set draft_json = excluded.draft_json, updated_at = now(), version = store_themes.version + 1
                """, TenantContext.requireTenantId(), draft);
        return state();
    }

    @Transactional
    public ThemeState publish() {
        if (row() == null) saveDraft(defaults().code(), defaults().settings(), -1);
        jdbc.update("update store_themes set published_json = draft_json, published_at = now(), version = version + 1 where tenant_id = ?",
                TenantContext.requireTenantId());
        auditLog.record(AuditEntry.tenant("theme.published", TenantContext.requireTenantId(), "theme", null));
        return state();
    }

    /** What the storefront renders: draft in preview, otherwise the published configuration (or the default). */
    @Transactional(readOnly = true)
    public ThemeConfig storefront(boolean preview) {
        Row r = row();
        if (r == null) return defaults();
        if (preview) return parse(r.draft());
        return r.published() == null ? defaults() : parse(r.published());
    }

    static ThemeConfig defaults() {
        return new ThemeConfig(ThemeRegistry.DEFAULT_CODE, ThemeRegistry.preset(ThemeRegistry.DEFAULT_CODE).orElseThrow().defaults());
    }

    private Row row() {
        return jdbc.query("select draft_json, published_json, published_at, version from store_themes where tenant_id = ?",
                (rs, i) -> new Row(rs.getString(1), rs.getString(2), rs.getTimestamp(3) == null ? null : rs.getTimestamp(3).toInstant(),
                        rs.getLong(4)), TenantContext.requireTenantId()).stream().findFirst().orElse(null);
    }

    private ThemeConfig parse(String value) {
        ThemeConfig raw = json.readValue(value, new TypeReference<ThemeConfig>() { });
        // Re-validated on read: a preset may have gained new settings since the configuration was saved.
        try {
            return new ThemeConfig(raw.code(), ThemeRegistry.validate(raw.code(), raw.settings()));
        } catch (IllegalArgumentException e) {
            return defaults();
        }
    }
}

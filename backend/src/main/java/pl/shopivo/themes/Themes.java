package pl.shopivo.themes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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

    public record ThemeConfig(String code, Map<String, String> settings, List<SectionRegistry.Section> sections) {
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
    public ThemeState saveDraft(String code, Map<String, String> settings, List<SectionRegistry.Section> sections, long version) {
        Map<String, String> valid;
        List<SectionRegistry.Section> validSections;
        try {
            valid = ThemeRegistry.validate(code, settings);
            validSections = sections == null ? migrated(new ThemeConfig(code, settings, null)) : SectionRegistry.validate(sections);
        } catch (IllegalArgumentException | java.util.NoSuchElementException e) {
            throw new BusinessRuleException("INVALID_THEME", e.getMessage() == null ? "Nieznany motyw." : e.getMessage());
        }
        String draft = json.writeValueAsString(new ThemeConfig(code, valid, validSections));
        UUID tenant = TenantContext.requireTenantId();
        // Compare-and-set in one statement: two editors saving the same version cannot both win.
        int changed = version < 0
                ? jdbc.update("insert into store_themes (tenant_id, draft_json) values (?, ?) on conflict (tenant_id) do nothing", tenant, draft)
                : jdbc.update("update store_themes set draft_json = ?, updated_at = now(), version = version + 1 where tenant_id = ? and version = ?",
                        draft, tenant, version);
        if (changed == 0) {
            throw new ConflictException("VERSION_CONFLICT", "Wygląd sklepu został w międzyczasie zmieniony. Odśwież stronę.");
        }
        return state();
    }

    @Transactional
    public ThemeState publish() {
        if (row() == null) saveDraft(defaults().code(), defaults().settings(), defaults().sections(), -1);
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
        ThemeRegistry.Preset p = ThemeRegistry.preset(ThemeRegistry.DEFAULT_CODE).orElseThrow();
        return new ThemeConfig(p.code(), p.defaults(), p.sections());
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
            List<SectionRegistry.Section> sections = raw.sections() == null ? migrated(raw) : SectionRegistry.validate(raw.sections());
            return new ThemeConfig(raw.code(), ThemeRegistry.validate(raw.code(), raw.settings()), sections);
        } catch (IllegalArgumentException | java.util.NoSuchElementException e) {
            return defaults();
        }
    }

    /** Configurations saved before sections existed: the template's sections with the merchant's old banner texts. */
    private static List<SectionRegistry.Section> migrated(ThemeConfig raw) {
        List<SectionRegistry.Section> base = ThemeRegistry.preset(raw.code()).orElseThrow().sections();
        Map<String, String> old = raw.settings() == null ? Map.of() : raw.settings();
        return base.stream().map(sec -> {
            if (!"hero".equals(sec.type())) return sec;
            Map<String, Object> data = new java.util.LinkedHashMap<>(sec.data());
            if (notBlank(old.get("heroTitle"))) data.put("heading", old.get("heroTitle"));
            if (notBlank(old.get("heroSubtitle"))) data.put("subheading", old.get("heroSubtitle"));
            if (notBlank(old.get("heroCta"))) data.put("cta", old.get("heroCta"));
            if (notBlank(old.get("heroCategory"))) data.put("link", "/kategoria/" + old.get("heroCategory"));
            if (notBlank(old.get("heroLayout"))) data.put("layout", old.get("heroLayout"));
            return SectionRegistry.validate(List.of(new SectionRegistry.Section(sec.id(), "hero", sec.enabled(), data))).getFirst();
        }).toList();
    }

    private static boolean notBlank(String v) {
        return v != null && !v.isBlank();
    }
}

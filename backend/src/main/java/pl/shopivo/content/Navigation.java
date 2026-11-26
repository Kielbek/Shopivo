package pl.shopivo.content;

import java.util.ArrayList;
import java.util.List;
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

/** Header menu of the current store. Only paths inside the store are allowed — never external links. */
@Service
public class Navigation {

    public static final int MAX_ITEMS = 12;

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final AuditLog auditLog;

    Navigation(JdbcTemplate jdbc, JsonMapper json, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.json = json;
        this.auditLog = auditLog;
    }

    public record Item(String label, String path) {
    }

    public record Menu(List<Item> items, boolean custom, long version) {
    }

    /** Items shown in the storefront header (empty = the storefront's default: top-level categories). */
    @Transactional(readOnly = true)
    public List<Item> menu() {
        return state().items();
    }

    @Transactional(readOnly = true)
    public Menu state() {
        return jdbc.query("select items_json, version from store_navigation where tenant_id = ?",
                (rs, i) -> new Menu(json.readValue(rs.getString(1), new TypeReference<List<Item>>() { }), true, rs.getLong(2)),
                TenantContext.requireTenantId()).stream().findFirst().orElse(new Menu(List.of(), false, -1));
    }

    /** Replaces the menu; an empty list restores the default. {@code version} -1 = no menu saved yet. */
    @Transactional
    public Menu save(List<Item> items, long version) {
        List<Item> clean = validate(items);
        UUID tenant = TenantContext.requireTenantId();
        String value = json.writeValueAsString(clean);
        int changed = version < 0
                ? jdbc.update("insert into store_navigation (tenant_id, items_json) values (?, ?) on conflict (tenant_id) do nothing", tenant, value)
                : jdbc.update("update store_navigation set items_json = ?, updated_at = now(), version = version + 1 where tenant_id = ? and version = ?",
                        value, tenant, version);
        if (changed == 0) throw new ConflictException("VERSION_CONFLICT", "Menu zostało w międzyczasie zmienione. Odśwież stronę.");
        auditLog.record(AuditEntry.tenant("navigation.updated", tenant, "navigation", null));
        return state();
    }

    static List<Item> validate(List<Item> items) {
        if (items == null) return List.of();
        if (items.size() > MAX_ITEMS) throw new BusinessRuleException("TOO_MANY_ITEMS", "Menu może mieć najwyżej " + MAX_ITEMS + " pozycji.");
        List<Item> result = new ArrayList<>();
        for (Item it : items) {
            String label = it == null || it.label() == null ? "" : it.label().strip();
            if (label.isEmpty() || label.length() > 40 || label.chars().anyMatch(c -> c < 0x20)) {
                throw new BusinessRuleException("INVALID_LABEL", "Nazwa pozycji menu: od 1 do 40 znaków.");
            }
            String path = it.path() == null ? "" : it.path().strip();
            if (!Redirects.PATH.matcher(path).matches()) {
                throw new BusinessRuleException("INVALID_PATH", "„" + label + "”: podaj adres w sklepie zaczynający się od / (np. /kategoria/kubki).");
            }
            result.add(new Item(label, path));
        }
        return result;
    }
}

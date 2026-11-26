package pl.shopivo.content.internal;

import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import pl.shopivo.content.LegalKey;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StorePublishCheck;

/** A store sells to consumers only with published terms and privacy policy, without template placeholders left in. */
@Component
class ContentPublishCheck implements StorePublishCheck {

    private final JdbcTemplate jdbc;

    ContentPublishCheck(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<String> missingForPublish() {
        List<String> missing = new ArrayList<>();
        for (LegalKey key : LegalKey.values()) {
            record Row(String status, boolean placeholders) {
            }
            Row row = jdbc.query("select status, position('[uzupełnij' in body) > 0 from content_entries where tenant_id = ? and system_key = ?",
                    (rs, i) -> new Row(rs.getString(1), rs.getBoolean(2)), TenantContext.requireTenantId(), key.name())
                    .stream().findFirst().orElse(null);
            if (key.requiredForPublish() && (row == null || !"PUBLISHED".equals(row.status()))) {
                missing.add("Opublikuj stronę „" + key.title() + "” (Strony i blog)");
            } else if (row != null && "PUBLISHED".equals(row.status()) && row.placeholders()) {
                missing.add("Uzupełnij fragmenty oznaczone [uzupełnij…] na stronie „" + key.title() + "”");
            }
        }
        return missing;
    }
}

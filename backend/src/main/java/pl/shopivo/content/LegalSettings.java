package pl.shopivo.content;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Store facts used by the legal document templates besides the company data: shipping time, the date the terms take
 * effect, a separate returns address and the analytics / advertising tools named in the privacy policy.
 */
@Service
public class LegalSettings {

    private static final Pattern MARKER = Pattern.compile("\\[uzupełnij[^\\]]*\\]");

    public record View(String shippingTime, LocalDate effectiveDate, String returnsAddress, String analyticsTools, String marketingTools,
            long version) {
        static final View EMPTY = new View(null, null, null, null, null, -1);
    }

    private final JdbcTemplate jdbc;
    private final AuditLog auditLog;

    LegalSettings(JdbcTemplate jdbc, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.auditLog = auditLog;
    }

    @Transactional(readOnly = true)
    public View current() {
        return jdbc.query("select * from store_legal_settings where tenant_id = ?", (rs, i) -> new View(rs.getString("shipping_time"),
                rs.getObject("effective_date", LocalDate.class), rs.getString("returns_address"), rs.getString("analytics_tools"),
                rs.getString("marketing_tools"), rs.getLong("version")), TenantContext.requireTenantId()).stream().findFirst().orElse(View.EMPTY);
    }

    /** Saves the settings; {@code version} -1 creates them. Blank values are stored as "not set". */
    @Transactional
    public View save(View in) {
        UUID tenant = TenantContext.requireTenantId();
        String shipping = clean(in.shippingTime(), 200, "Termin wysyłki");
        String returns = clean(in.returnsAddress(), 400, "Adres do zwrotów");
        String analytics = clean(in.analyticsTools(), 300, "Narzędzia analityczne");
        String marketing = clean(in.marketingTools(), 300, "Narzędzia reklamowe");
        if (in.effectiveDate() != null && (in.effectiveDate().isBefore(LocalDate.of(2000, 1, 1)) || in.effectiveDate().isAfter(LocalDate.now().plusYears(2)))) {
            throw new BusinessRuleException("INVALID_DATE", "Podaj prawidłową datę obowiązywania regulaminu.");
        }
        int changed;
        if (in.version() < 0) {
            changed = jdbc.update("""
                    insert into store_legal_settings (tenant_id, shipping_time, effective_date, returns_address, analytics_tools, marketing_tools)
                    values (?, ?, ?, ?, ?, ?) on conflict (tenant_id) do nothing
                    """, tenant, shipping, in.effectiveDate(), returns, analytics, marketing);
        } else {
            changed = jdbc.update("""
                    update store_legal_settings set shipping_time = ?, effective_date = ?, returns_address = ?, analytics_tools = ?,
                        marketing_tools = ?, updated_at = now(), version = version + 1
                    where tenant_id = ? and version = ?
                    """, shipping, in.effectiveDate(), returns, analytics, marketing, tenant, in.version());
        }
        if (changed == 0) throw new ConflictException("VERSION_CONFLICT", "Dane zostały w międzyczasie zmienione. Odśwież stronę.");
        auditLog.record(AuditEntry.tenant("content.legal.settings.updated", tenant, "store_legal_settings", null).with(Map.of()));
        return current();
    }

    /** The "[uzupełnij: …]" markers left in a document, without brackets (what is still missing). */
    public static List<String> missing(String body) {
        List<String> out = new ArrayList<>();
        if (body == null) return out;
        Matcher m = MARKER.matcher(body);
        while (m.find()) {
            String text = m.group().substring(1, m.group().length() - 1).replaceFirst("^uzupełnij:?\\s*", "").strip();
            out.add(text.isEmpty() ? "uzupełnij" : text);
        }
        return out;
    }

    private static String clean(String v, int max, String label) {
        if (v == null || v.isBlank()) return null;
        String s = v.strip().replaceAll("\\s+", " ");
        if (s.length() > max) throw new BusinessRuleException("TOO_LONG", label + ": najwyżej " + max + " znaków.");
        if (s.contains("[") || s.contains("]")) throw new BusinessRuleException("INVALID_TEXT", label + ": nie używaj nawiasów kwadratowych.");
        return s;
    }
}

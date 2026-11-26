package pl.shopivo.content;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * 301 redirects of a store. Only paths within the store are allowed (no external targets — the store's domain must not
 * become an open redirect). Chains are flattened on write, so every lookup is a single hop.
 */
@Service
public class Redirects {

    static final int MAX_REDIRECTS = 5000;
    /** A path on the store: starts with one slash, no scheme/host, no whitespace or control characters. */
    private static final Pattern PATH = Pattern.compile("^/(?!/)[^\\s\\\\\\p{Cntrl}]{0,299}$");

    private final JdbcTemplate jdbc;
    private final AuditLog auditLog;

    Redirects(JdbcTemplate jdbc, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.auditLog = auditLog;
    }

    public record RedirectView(UUID id, String fromPath, String toPath, boolean automatic, Instant createdAt) {
    }

    @Transactional(readOnly = true)
    public List<RedirectView> list() {
        return jdbc.query("select * from seo_redirects where tenant_id = ? order by created_at desc limit " + MAX_REDIRECTS,
                (rs, i) -> new RedirectView(rs.getObject("id", UUID.class), rs.getString("from_path"), rs.getString("to_path"),
                        rs.getBoolean("automatic"), rs.getTimestamp("created_at").toInstant()), TenantContext.requireTenantId());
    }

    @Transactional
    public RedirectView add(String from, String to) {
        String f = normalize(from, "Adres źródłowy");
        String t = normalize(to, "Adres docelowy");
        if (f.equals(t)) throw new BusinessRuleException("REDIRECT_LOOP", "Adres źródłowy i docelowy muszą się różnić.");
        UUID tenant = TenantContext.requireTenantId();
        Integer count = jdbc.queryForObject("select count(*) from seo_redirects where tenant_id = ?", Integer.class, tenant);
        if (count != null && count >= MAX_REDIRECTS) {
            throw new BusinessRuleException("TOO_MANY_REDIRECTS", "Sklep może mieć najwyżej " + MAX_REDIRECTS + " przekierowań.");
        }
        Boolean exists = jdbc.queryForObject("select exists(select 1 from seo_redirects where tenant_id = ? and from_path = ?)",
                Boolean.class, tenant, f);
        if (Boolean.TRUE.equals(exists)) throw new ConflictException("REDIRECT_EXISTS", "Przekierowanie z tego adresu już istnieje.");
        UUID id = store(f, t, false);
        auditLog.record(AuditEntry.tenant("seo.redirect.created", tenant, "redirect", id));
        return list().stream().filter(r -> r.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public void delete(UUID id) {
        UUID tenant = TenantContext.requireTenantId();
        if (jdbc.update("delete from seo_redirects where id = ? and tenant_id = ?", id, tenant) == 0) {
            throw new NotFoundException("Nie znaleziono przekierowania.");
        }
        auditLog.record(AuditEntry.tenant("seo.redirect.deleted", tenant, "redirect", id));
    }

    /** Called when a published URL changes (product, category, page or post slug): old links keep working. */
    @Transactional
    public void pathChanged(String oldPath, String newPath) {
        if (oldPath.equals(newPath)) return;
        UUID tenant = TenantContext.requireTenantId();
        // The new address is live now: a redirect away from it would hide it.
        jdbc.update("delete from seo_redirects where tenant_id = ? and from_path = ?", tenant, newPath);
        jdbc.update("delete from seo_redirects where tenant_id = ? and from_path = ?", tenant, oldPath);
        store(oldPath, newPath, true);
    }

    /** Target for a path that does not exist (any query string is ignored). */
    @Transactional(readOnly = true)
    public Optional<String> resolve(String path) {
        if (path == null || path.length() > 300 || !PATH.matcher(path).matches()) return Optional.empty();
        String p = stripTrailingSlash(path);
        return jdbc.query("select to_path from seo_redirects where tenant_id = ? and from_path = ?", (rs, i) -> rs.getString(1),
                TenantContext.requireTenantId(), p).stream().findFirst();
    }

    private UUID store(String from, String to, boolean automatic) {
        UUID tenant = TenantContext.requireTenantId();
        // Flatten chains: everything that pointed at `from` now points straight at `to`; a redirect back to itself is dropped.
        jdbc.update("update seo_redirects set to_path = ? where tenant_id = ? and to_path = ?", to, tenant, from);
        jdbc.update("delete from seo_redirects where tenant_id = ? and from_path = to_path", tenant);
        // If `to` itself redirects somewhere, point at the final target.
        String target = jdbc.query("select to_path from seo_redirects where tenant_id = ? and from_path = ?", (rs, i) -> rs.getString(1),
                tenant, to).stream().findFirst().orElse(to);
        if (target.equals(from)) {
            // A ↔ B swap: the newer rule wins.
            jdbc.update("delete from seo_redirects where tenant_id = ? and from_path = ?", tenant, to);
            target = to;
        }
        UUID id = UuidV7.generate();
        jdbc.update("insert into seo_redirects (id, tenant_id, from_path, to_path, automatic) values (?, ?, ?, ?, ?)",
                id, tenant, from, target, automatic);
        return id;
    }

    private static String normalize(String path, String label) {
        if (path == null || path.isBlank()) throw new BusinessRuleException("INVALID_PATH", label + ": podaj adres, np. /stara-strona.");
        String p = path.strip();
        // Accept a full URL of the store but keep only its path (no external targets).
        if (p.startsWith("https://") || p.startsWith("http://")) {
            try {
                var uri = java.net.URI.create(p);
                p = (uri.getRawPath() == null || uri.getRawPath().isEmpty() ? "/" : uri.getRawPath());
            } catch (IllegalArgumentException e) {
                throw new BusinessRuleException("INVALID_PATH", label + ": nieprawidłowy adres.");
            }
        }
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        int h = p.indexOf('#');
        if (h >= 0) p = p.substring(0, h);
        if (!PATH.matcher(p).matches()) {
            throw new BusinessRuleException("INVALID_PATH", label + ": adres w sklepie musi zaczynać się od / (np. /stara-strona).");
        }
        return stripTrailingSlash(p);
    }

    private static String stripTrailingSlash(String p) {
        return p.length() > 1 && p.endsWith("/") ? p.substring(0, p.length() - 1) : p;
    }
}

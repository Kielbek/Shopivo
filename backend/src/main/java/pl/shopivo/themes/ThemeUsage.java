package pl.shopivo.themes;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * How many stores use each template — an aggregate number for the template gallery (no store is named or exposed).
 * A store counts once, with its published template (or its draft if it never published), retired codes mapped to
 * their successor; suspended stores are left out. Cached for 10 minutes.
 */
@Service
public class ThemeUsage {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Cache<String, Map<String, Long>> cache = Caffeine.newBuilder().expireAfterWrite(Duration.ofMinutes(10)).maximumSize(1).build();

    ThemeUsage(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    public Map<String, Long> counts() {
        return cache.get("all", k -> {
            // Cross-store aggregate: the only place that reads every store's theme, and it returns counts only.
            Map<String, Long> out = new HashMap<>();
            TenantContext.runAsSystem(() -> tx.executeWithoutResult(s -> jdbc.query("""
                    select coalesce(t.published_json, t.draft_json)::jsonb ->> 'code' as code, count(*) as stores
                    from store_themes t join stores st on st.tenant_id = t.tenant_id
                    where st.status <> 'SUSPENDED' group by 1
                    """, rs -> {
                String code = ThemeRegistry.current(rs.getString("code"));
                if (code != null) out.merge(code, rs.getLong("stores"), Long::sum);
            })));
            return Map.copyOf(out);
        });
    }

    /** After a store saves or publishes its theme, the next gallery visit shows fresh numbers. */
    public void refresh() {
        cache.invalidateAll();
    }
}

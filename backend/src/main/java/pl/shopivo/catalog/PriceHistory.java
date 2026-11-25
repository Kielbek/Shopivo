package pl.shopivo.catalog;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Price history of variants for the Omnibus directive (art. 6a ustawy o informowaniu o cenach): when a price is
 * reduced the store must show the lowest price applied during the 30 days before the reduction.
 */
@Component
public class PriceHistory {

    static final Duration WINDOW = Duration.ofDays(30);

    private final JdbcTemplate jdbc;

    PriceHistory(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Records a new price (closes the previous period). No-op when the price did not change. */
    @Transactional
    public void record(UUID variantId, long priceMinor, Instant at) {
        UUID tenant = TenantContext.requireTenantId();
        Long current = jdbc.query("select price_minor from variant_price_history where tenant_id = ? and variant_id = ? and valid_to is null",
                (rs, i) -> rs.getLong(1), tenant, variantId).stream().findFirst().orElse(null);
        if (current != null && current == priceMinor) return;
        Timestamp ts = Timestamp.from(at);
        jdbc.update("update variant_price_history set valid_to = ? where tenant_id = ? and variant_id = ? and valid_to is null", ts, tenant, variantId);
        jdbc.update("insert into variant_price_history (id, tenant_id, variant_id, price_minor, valid_from) values (?, ?, ?, ?, ?)",
                UuidV7.generate(), tenant, variantId, priceMinor, ts);
    }

    /**
     * Lowest price during the 30 days before the current price took effect (the "previous price" Omnibus refers to).
     * If the variant had no other price in that window, the current price is returned.
     */
    @Transactional(readOnly = true)
    public Map<UUID, Long> lowestBeforeCurrent(List<UUID> variantIds) {
        Map<UUID, Long> result = new HashMap<>();
        if (variantIds.isEmpty()) return result;
        jdbc.query("""
                select cur.variant_id,
                       coalesce((select min(h.price_minor) from variant_price_history h
                           where h.tenant_id = cur.tenant_id and h.variant_id = cur.variant_id and h.id <> cur.id
                             and h.valid_from < cur.valid_from and coalesce(h.valid_to, cur.valid_from) > cur.valid_from - make_interval(days => ?)),
                           cur.price_minor) as lowest
                from variant_price_history cur
                where cur.tenant_id = ? and cur.valid_to is null and cur.variant_id = any(?)
                """, rs -> {
                    result.put(rs.getObject(1, UUID.class), rs.getLong(2));
                }, (int) WINDOW.toDays(), TenantContext.requireTenantId(), variantIds.toArray(UUID[]::new));
        return result;
    }
}

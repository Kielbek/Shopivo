package pl.shopivo.catalog;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.shared.tenancy.TenantContext;

/** Read-only variant data for carts and orders (current tenant). */
@Service
public class CatalogLookup {

    private final JdbcTemplate jdbc;
    private final Inventory inventory;

    CatalogLookup(JdbcTemplate jdbc, Inventory inventory) {
        this.jdbc = jdbc;
        this.inventory = inventory;
    }

    /**
     * @param available {@code null} when stock is not tracked
     */
    public record VariantSnapshot(UUID variantId, UUID productId, String productName, String productSlug, ProductStatus status,
            ProductType type, String variantTitle, String sku, long priceMinor, Long compareAtMinor, String currency,
            int vatRateBps, boolean trackInventory, boolean allowBackorder, Integer available, Integer weightGrams) {

        /** Can {@code quantity} be sold now? */
        public boolean canSell(int quantity) {
            return !trackInventory || allowBackorder || (available != null && available >= quantity);
        }
    }

    @Transactional(readOnly = true)
    public Map<UUID, VariantSnapshot> variants(Collection<UUID> variantIds) {
        Map<UUID, VariantSnapshot> result = new HashMap<>();
        if (variantIds.isEmpty()) return result;
        jdbc.query("""
                select v.id, p.id as product_id, p.name, p.slug, p.status, p.type, v.option_values_json, v.sku, v.price_minor,
                       v.compare_at_minor, v.currency, p.vat_rate_bps, v.track_inventory, v.allow_backorder,
                       i.on_hand - i.reserved as available, v.weight_grams
                from product_variants v join products p on p.id = v.product_id
                left join inventory_items i on i.variant_id = v.id
                where v.tenant_id = ? and v.id = any(?)
                """, rs -> {
                    boolean track = rs.getBoolean("track_inventory");
                    Object available = rs.getObject("available");
                    Object weight = rs.getObject("weight_grams");
                    Object compareAt = rs.getObject("compare_at_minor");
                    result.put(rs.getObject("id", UUID.class), new VariantSnapshot(rs.getObject("id", UUID.class),
                            rs.getObject("product_id", UUID.class), rs.getString("name"), rs.getString("slug"),
                            ProductStatus.valueOf(rs.getString("status")), ProductType.valueOf(rs.getString("type")),
                            inventory.variantTitle(rs.getString("option_values_json")), rs.getString("sku"), rs.getLong("price_minor"),
                            compareAt == null ? null : ((Number) compareAt).longValue(), rs.getString("currency"),
                            rs.getInt("vat_rate_bps"), track, rs.getBoolean("allow_backorder"),
                            track && available != null ? ((Number) available).intValue() : null,
                            weight == null ? null : ((Number) weight).intValue()));
                }, TenantContext.requireTenantId(), variantIds.toArray(UUID[]::new));
        return result;
    }
}

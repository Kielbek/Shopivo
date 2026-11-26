package pl.shopivo.catalog;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.catalog.CatalogViews.InventoryRow;
import pl.shopivo.catalog.CatalogViews.MovementView;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Stock levels per variant (single location). Every change is one atomic UPDATE plus a row in the append-only
 * movement ledger, so concurrent changes (two employees, an order) never lose updates and the history always adds up.
 */
@Service
public class Inventory {

    public static final int MAX_QUANTITY = 1_000_000;

    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    Inventory(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public enum Mode { DELTA, SET }

    public record StockLevel(int onHand, int reserved) {
        public int available() {
            return onHand - reserved;
        }
    }

    /** Creates the stock record for a new tracked variant (joins the caller's transaction). */
    @Transactional
    public void initialise(UUID variantId, int initialStock, UUID actor) {
        if (initialStock < 0 || initialStock > MAX_QUANTITY) {
            throw new BusinessRuleException("INVALID_QUANTITY", "Nieprawidłowy stan magazynowy.");
        }
        int inserted = jdbc.update("insert into inventory_items (variant_id, tenant_id, on_hand) values (?, ?, ?) on conflict do nothing",
                variantId, TenantContext.requireTenantId(), initialStock);
        if (inserted > 0 && initialStock > 0) {
            movement(variantId, initialStock, initialStock, MovementReason.INITIAL, null, null, actor);
        }
    }

    /**
     * Manual change by the merchant. {@code SET} records the difference as a correction. The result can never go
     * below zero or below the quantity already reserved by orders.
     */
    @Transactional
    public StockLevel adjust(UUID variantId, Mode mode, int quantity, MovementReason reason, String note, UUID actor) {
        if (reason == MovementReason.SALE || reason == MovementReason.ORDER_CANCELED || reason == MovementReason.INITIAL) {
            throw new BusinessRuleException("INVALID_REASON", "Ten powód jest ustawiany automatycznie.");
        }
        if (Math.abs((long) quantity) > MAX_QUANTITY) {
            throw new BusinessRuleException("INVALID_QUANTITY", "Nieprawidłowa ilość.");
        }
        StockLevel current = level(variantId).orElseThrow(() -> new NotFoundException("Ten wariant nie ma śledzonego stanu magazynowego."));
        int delta = mode == Mode.SET ? quantity - current.onHand() : quantity;
        if (mode == Mode.SET && quantity < 0) {
            throw new BusinessRuleException("INVALID_QUANTITY", "Stan nie może być ujemny.");
        }
        if (delta == 0) {
            return current;
        }
        return change(variantId, delta, reason, note, null, actor);
    }

    /**
     * Atomic change. Decreases fail if the result would be negative or below the reserved quantity; increases are always
     * accepted (with backorders the reservations may exceed the stock, and receiving goods must still be possible).
     */
    @Transactional
    public StockLevel change(UUID variantId, int delta, MovementReason reason, String note, String reference, UUID actor) {
        var rows = jdbc.query("""
                update inventory_items set on_hand = on_hand + ?, updated_at = now()
                where variant_id = ? and tenant_id = ? and on_hand + ? >= 0 and (? > 0 or on_hand + ? >= reserved)
                returning on_hand, reserved
                """, (rs, i) -> new StockLevel(rs.getInt(1), rs.getInt(2)), delta, variantId, TenantContext.requireTenantId(), delta, delta, delta);
        if (rows.isEmpty()) {
            if (level(variantId).isEmpty()) throw new NotFoundException("Ten wariant nie ma śledzonego stanu magazynowego.");
            throw new BusinessRuleException("INSUFFICIENT_STOCK", "Stan nie może spaść poniżej zera ani poniżej ilości zarezerwowanej w zamówieniach.");
        }
        StockLevel after = rows.getFirst();
        movement(variantId, delta, after.onHand(), reason, note, reference, actor);
        return after;
    }

    // ---------------------------------------------------------------- order reservations

    /**
     * Reserves stock for an order line. Fails with INSUFFICIENT_STOCK unless the variant allows backorders. Untracked
     * variants are not reserved (returns false).
     */
    @Transactional
    public boolean reserve(UUID variantId, int quantity, boolean allowBackorder) {
        UUID tenant = TenantContext.requireTenantId();
        int updated = jdbc.update("""
                update inventory_items set reserved = reserved + ?, updated_at = now()
                where variant_id = ? and tenant_id = ? and (? or on_hand - reserved >= ?)
                """, quantity, variantId, tenant, allowBackorder, quantity);
        if (updated == 0) {
            if (level(variantId).isEmpty()) return false;
            throw new BusinessRuleException("INSUFFICIENT_STOCK", "Niewystarczający stan magazynowy.");
        }
        return true;
    }

    /** Releases a reservation (order canceled before shipment). */
    @Transactional
    public void release(UUID variantId, int quantity) {
        jdbc.update("update inventory_items set reserved = greatest(reserved - ?, 0), updated_at = now() where variant_id = ? and tenant_id = ?",
                quantity, variantId, TenantContext.requireTenantId());
    }

    /** Writes off reserved stock when the order ships (records a SALE movement). */
    @Transactional
    public void fulfil(UUID variantId, int quantity, String reference, UUID actor) {
        var rows = jdbc.query("""
                update inventory_items set on_hand = on_hand - ?, reserved = greatest(reserved - ?, 0), updated_at = now()
                where variant_id = ? and tenant_id = ? returning on_hand
                """, (rs, i) -> rs.getInt(1), quantity, quantity, variantId, TenantContext.requireTenantId());
        if (!rows.isEmpty()) {
            movement(variantId, -quantity, rows.getFirst(), MovementReason.SALE, null, reference, actor);
        }
    }

    /** Puts stock back (order canceled after shipment / returned). */
    @Transactional
    public void restock(UUID variantId, int quantity, MovementReason reason, String reference, UUID actor) {
        var rows = jdbc.query("""
                update inventory_items set on_hand = on_hand + ?, updated_at = now() where variant_id = ? and tenant_id = ? returning on_hand
                """, (rs, i) -> rs.getInt(1), quantity, variantId, TenantContext.requireTenantId());
        if (!rows.isEmpty()) {
            movement(variantId, quantity, rows.getFirst(), reason, null, reference, actor);
        }
    }

    @Transactional
    public void setThreshold(UUID variantId, int threshold) {
        if (threshold < 0 || threshold > MAX_QUANTITY) throw new BusinessRuleException("INVALID_QUANTITY", "Nieprawidłowy próg.");
        if (jdbc.update("update inventory_items set low_stock_threshold = ? where variant_id = ? and tenant_id = ?",
                threshold, variantId, TenantContext.requireTenantId()) == 0) {
            throw new NotFoundException("Ten wariant nie ma śledzonego stanu magazynowego.");
        }
    }

    @Transactional(readOnly = true)
    public java.util.Optional<StockLevel> level(UUID variantId) {
        return jdbc.query("select on_hand, reserved from inventory_items where variant_id = ? and tenant_id = ?",
                (rs, i) -> new StockLevel(rs.getInt(1), rs.getInt(2)), variantId, TenantContext.requireTenantId()).stream().findFirst();
    }

    @Transactional(readOnly = true)
    public Map<UUID, StockLevel> levels(List<UUID> variantIds) {
        Map<UUID, StockLevel> result = new java.util.HashMap<>();
        if (variantIds.isEmpty()) return result;
        jdbc.query("select variant_id, on_hand, reserved from inventory_items where tenant_id = ? and variant_id = any(?)",
                rs -> {
                    result.put(rs.getObject(1, UUID.class), new StockLevel(rs.getInt(2), rs.getInt(3)));
                }, TenantContext.requireTenantId(), variantIds.toArray(UUID[]::new));
        return result;
    }

    /** Stops tracking (variant switched to untracked): the record is kept for history but no longer listed. */
    @Transactional
    public void remove(UUID variantId) {
        jdbc.update("delete from inventory_items where variant_id = ? and tenant_id = ?", variantId, TenantContext.requireTenantId());
    }

    @Transactional(readOnly = true)
    public Page<InventoryRow> list(String query, boolean lowOnly, Pageable pageable) {
        UUID tenant = TenantContext.requireTenantId();
        StringBuilder where = new StringBuilder(" where i.tenant_id = ? and p.status <> 'ARCHIVED'");
        List<Object> args = new ArrayList<>(List.of(tenant));
        if (query != null && !query.isBlank()) {
            where.append(" and (lower(p.name) like ? or lower(v.sku) like ?)");
            String like = "%" + query.trim().toLowerCase().replace("%", "\\%").replace("_", "\\_") + "%";
            args.add(like);
            args.add(like);
        }
        if (lowOnly) {
            where.append(" and i.on_hand - i.reserved <= i.low_stock_threshold");
        }
        String from = " from inventory_items i join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id";
        Long total = jdbc.queryForObject("select count(*)" + from + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        List<InventoryRow> rows = jdbc.query("""
                select i.variant_id, p.id as product_id, p.name, v.option_values_json, v.sku, p.status, i.on_hand, i.reserved,
                       i.low_stock_threshold, i.updated_at
                """ + from + where + " order by (i.on_hand - i.reserved - i.low_stock_threshold) asc, lower(p.name), v.position limit ? offset ?",
                (rs, i) -> {
                    int onHand = rs.getInt("on_hand");
                    int reserved = rs.getInt("reserved");
                    int threshold = rs.getInt("low_stock_threshold");
                    return new InventoryRow(rs.getObject("variant_id", UUID.class), rs.getObject("product_id", UUID.class),
                            rs.getString("name"), variantTitle(rs.getString("option_values_json")), rs.getString("sku"),
                            ProductStatus.valueOf(rs.getString("status")), onHand, reserved, onHand - reserved, threshold,
                            onHand - reserved <= threshold, rs.getTimestamp("updated_at").toInstant());
                }, pageArgs.toArray());
        return new PageImpl<>(rows, pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public List<MovementView> movements(UUID variantId, int limit) {
        return jdbc.query("""
                select m.id, m.delta, m.on_hand_after, m.reason, m.note, m.reference, m.created_at,
                       nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') as actor
                from inventory_movements m left join users u on u.id = m.actor_user_id
                where m.tenant_id = ? and m.variant_id = ? order by m.created_at desc, m.id desc limit ?
                """, (rs, i) -> new MovementView(rs.getObject("id", UUID.class), rs.getInt("delta"), rs.getInt("on_hand_after"),
                MovementReason.valueOf(rs.getString("reason")), rs.getString("note"), rs.getString("reference"),
                rs.getString("actor"), rs.getTimestamp("created_at").toInstant()),
                TenantContext.requireTenantId(), variantId, Math.clamp(limit, 1, 200));
    }

    private void movement(UUID variantId, int delta, int after, MovementReason reason, String note, String reference, UUID actor) {
        jdbc.update("""
                insert into inventory_movements (id, tenant_id, variant_id, delta, on_hand_after, reason, note, reference, actor_user_id, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UuidV7.generate(), TenantContext.requireTenantId(), variantId, delta, after, reason.name(),
                note == null || note.isBlank() ? null : note.trim().substring(0, Math.min(note.trim().length(), 300)),
                reference, actor, Timestamp.from(java.time.Instant.now()));
    }

    /** "Rozmiar: M · Kolor: Czerwony"; empty for single-variant products. */
    String variantTitle(String optionValuesJson) {
        Map<String, String> values = json.readValue(optionValuesJson, new TypeReference<java.util.LinkedHashMap<String, String>>() { });
        return String.join(" · ", values.values());
    }
}

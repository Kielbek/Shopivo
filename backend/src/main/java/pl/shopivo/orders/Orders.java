package pl.shopivo.orders;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.catalog.Inventory;
import pl.shopivo.customers.Customers;
import pl.shopivo.orders.OrderModel.Address;
import pl.shopivo.orders.OrderModel.Billing;
import pl.shopivo.orders.OrderModel.OrderConfirmation;
import pl.shopivo.orders.OrderModel.OrderEventView;
import pl.shopivo.orders.OrderModel.OrderItemView;
import pl.shopivo.orders.OrderModel.OrderRow;
import pl.shopivo.orders.OrderModel.OrderStats;
import pl.shopivo.orders.OrderModel.OrderStatus;
import pl.shopivo.orders.OrderModel.OrderView;
import pl.shopivo.orders.OrderModel.PaymentMethod;
import pl.shopivo.orders.OrderModel.PaymentStatus;
import pl.shopivo.orders.OrderModel.Source;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;
import tools.jackson.databind.json.JsonMapper;

/** Orders of the current store: listing, details and the fulfilment workflow. */
@Service
public class Orders {

    static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");

    private final JdbcTemplate jdbc;
    private final Inventory inventory;
    private final Customers customers;
    private final PaymentSettings paymentSettings;
    private final ApplicationEventPublisher events;
    private final AuditLog auditLog;
    private final JsonMapper json;

    Orders(JdbcTemplate jdbc, Inventory inventory, Customers customers, PaymentSettings paymentSettings,
            ApplicationEventPublisher events, AuditLog auditLog, JsonMapper json) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.customers = customers;
        this.paymentSettings = paymentSettings;
        this.events = events;
        this.auditLog = auditLog;
        this.json = json;
    }

    record Head(UUID id, long number, OrderStatus status, PaymentStatus paymentStatus, PaymentMethod paymentMethod,
            UUID customerId, long total, long version) {
    }

    // ------------------------------------------------------------------------------------------------ queries

    @Transactional(readOnly = true)
    public Page<OrderRow> search(String query, OrderStatus status, PaymentStatus paymentStatus, UUID customerId, Pageable pageable) {
        StringBuilder where = new StringBuilder(" where o.tenant_id = ?");
        List<Object> args = new ArrayList<>(List.of(TenantContext.requireTenantId()));
        if (status != null) {
            where.append(" and o.status = ?");
            args.add(status.name());
        }
        if (paymentStatus != null) {
            where.append(" and o.payment_status = ?");
            args.add(paymentStatus.name());
        }
        if (customerId != null) {
            where.append(" and o.customer_id = ?");
            args.add(customerId);
        }
        if (query != null && !query.isBlank()) {
            String q = query.trim().replaceFirst("^#", "");
            String like = "%" + q.toLowerCase().replace("%", "\\%").replace("_", "\\_") + "%";
            where.append(" and (o.number::text = ? or lower(o.email) like ? or lower(o.first_name || ' ' || o.last_name) like ?)");
            args.add(q);
            args.add(like);
            args.add(like);
        }
        Long total = jdbc.queryForObject("select count(*) from orders o" + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        List<OrderRow> rows = jdbc.query("""
                select o.*, (select coalesce(sum(quantity), 0) from order_items i where i.order_id = o.id) as item_count
                from orders o""" + where + " order by o.created_at desc, o.number desc limit ? offset ?", (rs, i) -> new OrderRow(
                rs.getObject("id", UUID.class), rs.getLong("number"), OrderStatus.valueOf(rs.getString("status")),
                PaymentStatus.valueOf(rs.getString("payment_status")), PaymentMethod.valueOf(rs.getString("payment_method")),
                rs.getString("first_name") + " " + rs.getString("last_name"), rs.getString("email"), rs.getInt("item_count"),
                rs.getLong("total_minor"), rs.getString("currency"), rs.getTimestamp("created_at").toInstant()), pageArgs.toArray());
        return new PageImpl<>(rows, pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public OrderView get(UUID id) {
        UUID tenant = TenantContext.requireTenantId();
        List<OrderView> found = jdbc.query("select * from orders where id = ? and tenant_id = ?", (rs, i) -> map(rs, items(id), events(id)), id, tenant);
        if (found.isEmpty()) throw new NotFoundException("Nie znaleziono zamówienia.");
        return found.getFirst();
    }

    @Transactional(readOnly = true)
    public OrderStats stats() {
        UUID tenant = TenantContext.requireTenantId();
        Timestamp today = Timestamp.from(LocalDate.now(ZONE).atStartOfDay(ZONE).toInstant());
        Timestamp month = Timestamp.from(LocalDate.now(ZONE).minusDays(29).atStartOfDay(ZONE).toInstant());
        return jdbc.queryForObject("""
                select count(*) filter (where status = 'NEW'), count(*) filter (where status = 'PROCESSING'),
                       count(*) filter (where payment_status = 'UNPAID' and status not in ('CANCELED') and payment_method <> 'COD'),
                       count(*) filter (where created_at >= ? and status <> 'CANCELED'),
                       coalesce(sum(total_minor) filter (where created_at >= ? and status <> 'CANCELED'), 0),
                       coalesce(sum(total_minor) filter (where created_at >= ? and status <> 'CANCELED'), 0),
                       count(*) filter (where created_at >= ? and status <> 'CANCELED')
                from orders where tenant_id = ?
                """, (rs, i) -> new OrderStats(rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getLong(4), rs.getLong(5), rs.getLong(6),
                rs.getLong(7), "PLN"), today, today, month, month, tenant);
    }

    /** Daily revenue (non-canceled orders, gross) for the last {@code days} days — overview chart. */
    @Transactional(readOnly = true)
    public Map<LocalDate, long[]> daily(int days) {
        LocalDate first = LocalDate.now(ZONE).minusDays(days - 1L);
        Map<LocalDate, long[]> result = new java.util.TreeMap<>();
        for (int i = 0; i < days; i++) result.put(first.plusDays(i), new long[] {0, 0});
        jdbc.query("""
                select (created_at at time zone 'Europe/Warsaw')::date as d, count(*), sum(total_minor)
                from orders where tenant_id = ? and status <> 'CANCELED' and created_at >= ? group by 1
                """, rs -> {
                    long[] v = result.get(rs.getDate(1).toLocalDate());
                    if (v != null) {
                        v[0] = rs.getLong(2);
                        v[1] = rs.getLong(3);
                    }
                }, TenantContext.requireTenantId(), Timestamp.from(first.atStartOfDay(ZONE).toInstant()));
        return result;
    }

    /** Customer-facing confirmation by the secret token from checkout. */
    @Transactional(readOnly = true)
    public OrderConfirmation confirmation(String token) {
        UUID tenant = TenantContext.requireTenantId();
        List<UUID> ids = jdbc.query("select id from orders where public_token_hash = ? and tenant_id = ?", (rs, i) -> rs.getObject(1, UUID.class),
                Tokens.sha256(token == null ? "" : token), tenant);
        if (ids.isEmpty()) throw new NotFoundException("Nie znaleziono zamówienia.");
        OrderView o = get(ids.getFirst());
        var bank = o.paymentMethod() == PaymentMethod.BANK_TRANSFER && o.paymentStatus() == PaymentStatus.UNPAID
                ? paymentSettings.current() : null;
        return new OrderConfirmation(o.number(), o.status(), o.paymentStatus(), o.paymentMethod(), o.items(), o.subtotalMinor(),
                o.shippingMinor(), o.paymentFeeMinor(), o.totalMinor(), o.currency(), o.shippingMethodName(), bank, o.createdAt());
    }

    // ------------------------------------------------------------------------------------------------ workflow

    @Transactional
    public OrderView changeStatus(UUID id, OrderStatus target, String trackingNumber, String reason, long version, UUID actor) {
        Head o = lock(id, version);
        UUID tenant = TenantContext.requireTenantId();
        String ref = "Zamówienie #" + o.number();
        switch (target) {
            case PROCESSING -> {
                requireFrom(o, target, OrderStatus.NEW);
                jdbc.update("update orders set status = 'PROCESSING', updated_at = now(), version = version + 1 where id = ?", id);
                event(jdbc, tenant, id, "STATUS", "Status: w realizacji", false, actor);
            }
            case SHIPPED -> {
                requireFrom(o, target, OrderStatus.NEW, OrderStatus.PROCESSING);
                for (var item : reservedItems(id)) {
                    inventory.fulfil(item.variantId(), item.quantity(), ref, actor);
                }
                jdbc.update("update order_items set reserved_qty = 0 where order_id = ? and tenant_id = ?", id, tenant);
                String tracking = trackingNumber == null || trackingNumber.isBlank() ? null : trackingNumber.trim();
                if (tracking != null && tracking.length() > 80) throw new BusinessRuleException("TOO_LONG", "Numer przesyłki jest za długi.");
                jdbc.update("update orders set status = 'SHIPPED', tracking_number = ?, shipped_at = now(), updated_at = now(), version = version + 1 where id = ?",
                        tracking, id);
                event(jdbc, tenant, id, "STATUS", "Status: wysłane" + (tracking == null ? "" : " (przesyłka " + tracking + ")"), false, actor);
                events.publishEvent(new OrderEvents.OrderShipped(tenant, id));
            }
            case COMPLETED -> {
                requireFrom(o, target, OrderStatus.SHIPPED);
                jdbc.update("update orders set status = 'COMPLETED', completed_at = now(), updated_at = now(), version = version + 1 where id = ?", id);
                event(jdbc, tenant, id, "STATUS", "Status: zrealizowane", false, actor);
                events.publishEvent(new OrderEvents.OrderCompleted(tenant, id));
            }
            case CANCELED -> cancel(o, reason, actor, true);
            case NEW -> throw new BusinessRuleException("INVALID_TRANSITION", "Nie można przywrócić statusu „Nowe”.");
        }
        auditLog.record(AuditEntry.tenant("order.status.changed", tenant, "order", id).with(Map.of("status", target.name())));
        return get(id);
    }

    @Transactional
    public OrderView markPaid(UUID id, long version, UUID actor) {
        Head o = lock(id, version);
        if (o.paymentStatus() != PaymentStatus.UNPAID) throw new BusinessRuleException("ALREADY_PAID", "Zamówienie jest już opłacone.");
        if (o.status() == OrderStatus.CANCELED) throw new BusinessRuleException("ORDER_CANCELED", "Zamówienie jest anulowane.");
        jdbc.update("update orders set payment_status = 'PAID', paid_at = now(), updated_at = now(), version = version + 1 where id = ?", id);
        event(jdbc, TenantContext.requireTenantId(), id, "PAYMENT", "Oznaczono jako opłacone", false, actor);
        auditLog.record(AuditEntry.tenant("order.paid", TenantContext.requireTenantId(), "order", id));
        return get(id);
    }

    @Transactional
    public OrderView markRefunded(UUID id, long version, UUID actor) {
        Head o = lock(id, version);
        if (o.paymentStatus() != PaymentStatus.PAID || o.status() != OrderStatus.CANCELED) {
            throw new BusinessRuleException("INVALID_TRANSITION", "Zwrot pieniędzy można oznaczyć dla opłaconego, anulowanego zamówienia.");
        }
        jdbc.update("update orders set payment_status = 'REFUNDED', updated_at = now(), version = version + 1 where id = ?", id);
        event(jdbc, TenantContext.requireTenantId(), id, "PAYMENT", "Oznaczono zwrot pieniędzy", false, actor);
        auditLog.record(AuditEntry.tenant("order.refunded", TenantContext.requireTenantId(), "order", id));
        return get(id);
    }

    @Transactional
    public OrderView addNote(UUID id, String message, UUID actor) {
        get(id);
        if (message == null || message.isBlank()) throw new BusinessRuleException("NOTE_REQUIRED", "Wpisz treść notatki.");
        if (message.length() > 1000) throw new BusinessRuleException("NOTE_TOO_LONG", "Notatka może mieć najwyżej 1000 znaków.");
        event(jdbc, TenantContext.requireTenantId(), id, "NOTE", message.strip(), true, actor);
        return get(id);
    }

    /** Automatic cancellation of an unpaid bank-transfer order (job, tenant context bound). */
    @Transactional
    public void cancelUnpaid(UUID id, String reason) {
        List<Head> rows = heads("select * from orders where id = ? and tenant_id = ? for update", id, TenantContext.requireTenantId());
        if (rows.isEmpty()) return;
        Head o = rows.getFirst();
        if (o.status() != OrderStatus.NEW || o.paymentStatus() != PaymentStatus.UNPAID) return;
        cancel(o, reason, null, true);
    }

    private void cancel(Head o, String reason, UUID actor, boolean notify) {
        requireFrom(o, OrderStatus.CANCELED, OrderStatus.NEW, OrderStatus.PROCESSING);
        UUID tenant = TenantContext.requireTenantId();
        for (var item : reservedItems(o.id())) {
            inventory.release(item.variantId(), item.quantity());
        }
        jdbc.update("update order_items set reserved_qty = 0 where order_id = ? and tenant_id = ?", o.id(), tenant);
        String r = reason == null || reason.isBlank() ? null : reason.strip();
        if (r != null && r.length() > 300) r = r.substring(0, 300);
        jdbc.update("update orders set status = 'CANCELED', canceled_at = now(), cancel_reason = ?, updated_at = now(), version = version + 1 where id = ?",
                r, o.id());
        if (o.customerId() != null) customers.recordOrder(o.customerId(), -1, -o.total(), Instant.now());
        event(jdbc, tenant, o.id(), "STATUS", "Zamówienie anulowane" + (r == null ? "" : ": " + r), false, actor);
        events.publishEvent(new OrderEvents.OrderCanceled(tenant, o.id(), notify));
    }

    // ------------------------------------------------------------------------------------------------ helpers

    record Reserved(UUID variantId, int quantity) {
    }

    private List<Reserved> reservedItems(UUID orderId) {
        return jdbc.query("select variant_id, reserved_qty from order_items where order_id = ? and tenant_id = ? and reserved_qty > 0 and variant_id is not null",
                (rs, i) -> new Reserved(rs.getObject(1, UUID.class), rs.getInt(2)), orderId, TenantContext.requireTenantId());
    }

    private Head lock(UUID id, long version) {
        List<Head> rows = heads("select * from orders where id = ? and tenant_id = ? for update", id, TenantContext.requireTenantId());
        if (rows.isEmpty()) throw new NotFoundException("Nie znaleziono zamówienia.");
        Head o = rows.getFirst();
        if (o.version() != version) {
            throw new ConflictException("VERSION_CONFLICT", "Zamówienie zostało w międzyczasie zmienione. Odśwież stronę.");
        }
        return o;
    }

    private List<Head> heads(String sql, Object... args) {
        return jdbc.query(sql, (rs, i) -> new Head(rs.getObject("id", UUID.class), rs.getLong("number"),
                OrderStatus.valueOf(rs.getString("status")), PaymentStatus.valueOf(rs.getString("payment_status")),
                PaymentMethod.valueOf(rs.getString("payment_method")), rs.getObject("customer_id", UUID.class),
                rs.getLong("total_minor"), rs.getLong("version")), args);
    }

    private static void requireFrom(Head o, OrderStatus target, OrderStatus... allowed) {
        for (OrderStatus s : allowed) if (o.status() == s) return;
        throw new BusinessRuleException("INVALID_TRANSITION", switch (target) {
            case SHIPPED -> "Wysłać można tylko nowe lub realizowane zamówienie.";
            case COMPLETED -> "Zrealizować można tylko wysłane zamówienie.";
            case CANCELED -> o.status() == OrderStatus.SHIPPED || o.status() == OrderStatus.COMPLETED
                    ? "Wysłanego zamówienia nie można anulować — obsłuż je jako zwrot."
                    : "Zamówienie jest już anulowane.";
            default -> "Niedozwolona zmiana statusu.";
        });
    }

    static void event(JdbcTemplate jdbc, UUID tenant, UUID orderId, String type, String message, boolean internal, UUID actor) {
        jdbc.update("insert into order_events (id, tenant_id, order_id, type, message, internal, actor_user_id) values (?, ?, ?, ?, ?, ?, ?)",
                UuidV7.generate(), tenant, orderId, type, message, internal, actor);
    }

    private List<OrderItemView> items(UUID orderId) {
        return jdbc.query("select * from order_items where order_id = ? and tenant_id = ? order by position", (rs, i) -> new OrderItemView(
                rs.getObject("id", UUID.class), rs.getObject("product_id", UUID.class), rs.getObject("variant_id", UUID.class),
                rs.getString("name"), rs.getString("variant_title"), rs.getString("sku"), rs.getInt("quantity"),
                rs.getLong("unit_price_minor"), rs.getInt("vat_rate_bps"), rs.getLong("line_total_minor")),
                orderId, TenantContext.requireTenantId());
    }

    private List<OrderEventView> events(UUID orderId) {
        return jdbc.query("""
                select e.type, e.message, e.internal, e.created_at,
                       nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') as actor
                from order_events e left join users u on u.id = e.actor_user_id
                where e.order_id = ? and e.tenant_id = ? order by e.created_at, e.id
                """, (rs, i) -> new OrderEventView(rs.getString("type"), rs.getString("message"), rs.getBoolean("internal"),
                rs.getString("actor"), rs.getTimestamp("created_at").toInstant()), orderId, TenantContext.requireTenantId());
    }

    private OrderView map(ResultSet rs, List<OrderItemView> items, List<OrderEventView> events) throws SQLException {
        String addr = rs.getString("shipping_address_json");
        String bill = rs.getString("billing_json");
        return new OrderView(rs.getObject("id", UUID.class), rs.getLong("number"), Source.valueOf(rs.getString("source")),
                OrderStatus.valueOf(rs.getString("status")), PaymentStatus.valueOf(rs.getString("payment_status")),
                PaymentMethod.valueOf(rs.getString("payment_method")), rs.getObject("customer_id", UUID.class), rs.getString("email"),
                rs.getString("phone"), rs.getString("first_name"), rs.getString("last_name"),
                addr == null ? null : json.readValue(addr, Address.class), bill == null ? null : json.readValue(bill, Billing.class),
                rs.getString("shipping_method_name"), rs.getLong("shipping_minor"), rs.getLong("payment_fee_minor"),
                rs.getLong("subtotal_minor"), rs.getLong("discount_minor"), rs.getLong("total_minor"), rs.getLong("tax_minor"),
                rs.getString("currency"), rs.getString("customer_note"), rs.getString("tracking_number"), items, events,
                ts(rs, "paid_at"), ts(rs, "shipped_at"), ts(rs, "completed_at"), ts(rs, "canceled_at"), rs.getString("cancel_reason"),
                ts(rs, "terms_accepted_at"), rs.getObject("terms_revision_id", UUID.class), ts(rs, "created_at"), rs.getLong("version"));
    }

    private static Instant ts(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }
}

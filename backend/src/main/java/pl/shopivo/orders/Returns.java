package pl.shopivo.orders;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
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
import pl.shopivo.orders.OrderModel.OrderStatus;
import pl.shopivo.orders.OrderModel.OrderView;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Returns and complaints. A customer submits a request from their account for items of a shipped order: a statutory
 * withdrawal (within {@link #WITHDRAWAL_PERIOD} of delivery) or a complaint (within {@link #COMPLAINT_PERIOD} of
 * shipping). The merchant accepts or rejects it and marks it completed once the goods are back and the money is
 * refunded (refunds themselves happen outside this module).
 */
@Service
public class Returns {

    public static final Duration WITHDRAWAL_PERIOD = Duration.ofDays(14);
    public static final Duration COMPLAINT_PERIOD = Duration.ofDays(730);
    static final int MAX_PER_ORDER = 5;

    public enum Kind { WITHDRAWAL, COMPLAINT }

    public enum Status { REQUESTED, ACCEPTED, REJECTED, COMPLETED }

    public record ItemInput(UUID orderItemId, int quantity) {
    }

    public record ReturnInput(Kind kind, List<ItemInput> items, String reason, String refundAccount) {
    }

    public record Item(UUID orderItemId, String name, String variantTitle, int quantity, long unitPriceMinor) {
    }

    public record ReturnView(UUID id, long number, UUID orderId, long orderNumber, Kind kind, Status status, String reason,
            String refundAccount, String merchantNote, String customerEmail, String customerName, long valueMinor, String currency,
            List<Item> items, Instant createdAt, Instant decidedAt, Instant completedAt, long version) {
    }

    /** Published after commit: the mailer tells the customer (and, for a new request, the store). */
    public record ReturnChanged(UUID tenantId, UUID returnId, Status status) {
    }

    private final JdbcTemplate jdbc;
    private final Orders orders;
    private final AuditLog auditLog;
    private final ApplicationEventPublisher events;

    Returns(JdbcTemplate jdbc, Orders orders, AuditLog auditLog, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.orders = orders;
        this.auditLog = auditLog;
        this.events = events;
    }

    // ------------------------------------------------------------------------------------------------ customer

    /** What can still be returned from an order (ordered minus requested in requests that were not rejected). */
    @Transactional(readOnly = true)
    public Map<UUID, Integer> returnable(OrderView order) {
        Map<UUID, Integer> left = new HashMap<>();
        order.items().forEach(i -> left.put(i.id(), i.quantity()));
        jdbc.query("""
                select i.order_item_id, sum(i.quantity) from return_request_items i join return_requests r on r.id = i.return_id
                where r.tenant_id = ? and r.order_id = ? and r.status <> 'REJECTED' group by i.order_item_id
                """, rs -> {
            UUID item = rs.getObject(1, UUID.class);
            int used = rs.getInt(2);
            left.computeIfPresent(item, (k, v) -> Math.max(0, v - used));
        }, TenantContext.requireTenantId(), order.id());
        return left;
    }

    /** Which kinds of request the order allows now (empty = none). */
    public List<Kind> allowedKinds(OrderView order) {
        List<Kind> kinds = new ArrayList<>();
        if (order.status() != OrderStatus.SHIPPED && order.status() != OrderStatus.COMPLETED) return kinds;
        Instant now = Instant.now();
        if (order.completedAt() == null || order.completedAt().plus(WITHDRAWAL_PERIOD).isAfter(now)) kinds.add(Kind.WITHDRAWAL);
        Instant shipped = order.shippedAt() != null ? order.shippedAt() : order.completedAt();
        if (shipped == null || shipped.plus(COMPLAINT_PERIOD).isAfter(now)) kinds.add(Kind.COMPLAINT);
        return kinds;
    }

    @Transactional
    public ReturnView request(OrderView order, ReturnInput in) {
        UUID tenant = TenantContext.requireTenantId();
        jdbc.queryForList("select pg_advisory_xact_lock(hashtext(?))", "returns:" + tenant);
        if (in == null || in.kind() == null) throw new BusinessRuleException("INVALID_KIND", "Wybierz: zwrot czy reklamacja.");
        if (order.status() != OrderStatus.SHIPPED && order.status() != OrderStatus.COMPLETED) {
            throw new BusinessRuleException("ORDER_NOT_SHIPPED", "Zwrot lub reklamację można zgłosić po wysłaniu zamówienia.");
        }
        if (!allowedKinds(order).contains(in.kind())) {
            throw new BusinessRuleException("PERIOD_OVER", in.kind() == Kind.WITHDRAWAL
                    ? "Minął 14-dniowy termin na odstąpienie od umowy. Możesz zgłosić reklamację, jeśli produkt jest wadliwy."
                    : "Minął termin na zgłoszenie reklamacji.");
        }
        Integer open = jdbc.queryForObject("select count(*) from return_requests where tenant_id = ? and order_id = ?", Integer.class, tenant, order.id());
        if (open != null && open >= MAX_PER_ORDER) {
            throw new BusinessRuleException("TOO_MANY_RETURNS", "Do tego zamówienia zgłoszono już maksymalną liczbę zwrotów. Skontaktuj się ze sklepem.");
        }
        String reason = trim(in.reason(), 2000);
        if (in.kind() == Kind.COMPLAINT && (reason == null || reason.length() < 10)) {
            throw new BusinessRuleException("REASON_REQUIRED", "Opisz wadę produktu (co najmniej 10 znaków).");
        }
        String account = in.refundAccount() == null ? null : in.refundAccount().replaceAll("[\\s-]", "").toUpperCase();
        if (account != null && account.isEmpty()) account = null;
        if (account != null && !account.matches("^(PL)?\\d{26}$")) {
            throw new BusinessRuleException("INVALID_ACCOUNT", "Numer rachunku powinien mieć 26 cyfr.");
        }
        if (in.items() == null || in.items().isEmpty()) throw new BusinessRuleException("NO_ITEMS", "Wybierz co najmniej jeden produkt.");
        Map<UUID, Integer> left = returnable(order);
        Map<UUID, Integer> chosen = new HashMap<>();
        for (ItemInput i : in.items()) {
            if (i == null || i.orderItemId() == null || !left.containsKey(i.orderItemId())) {
                throw new BusinessRuleException("INVALID_ITEM", "Produkt nie należy do tego zamówienia.");
            }
            int q = chosen.merge(i.orderItemId(), i.quantity(), Integer::sum);
            if (i.quantity() < 1 || q > left.get(i.orderItemId())) {
                throw new BusinessRuleException("INVALID_QUANTITY", "Nie można zgłosić więcej sztuk, niż zostało do zwrotu.");
            }
        }
        UUID id = UuidV7.generate();
        Long number = jdbc.queryForObject("select coalesce(max(number), 0) + 1 from return_requests where tenant_id = ?", Long.class, tenant);
        jdbc.update("""
                insert into return_requests (id, tenant_id, number, order_id, kind, status, reason, refund_account)
                values (?, ?, ?, ?, ?, 'REQUESTED', ?, ?)
                """, id, tenant, number, order.id(), in.kind().name(), reason, account);
        chosen.forEach((itemId, q) -> jdbc.update("insert into return_request_items (return_id, tenant_id, order_item_id, quantity) values (?, ?, ?, ?)",
                id, tenant, itemId, q));
        auditLog.record(AuditEntry.tenant("orders.return.requested", tenant, "return", id));
        events.publishEvent(new ReturnChanged(tenant, id, Status.REQUESTED));
        return get(id);
    }

    /** Requests for these orders (a customer's own), newest first. */
    @Transactional(readOnly = true)
    public List<ReturnView> forOrders(List<UUID> orderIds) {
        if (orderIds.isEmpty()) return List.of();
        String in = String.join(",", orderIds.stream().map(x -> "?").toList());
        List<Object> args = new ArrayList<>(orderIds);
        args.addFirst(TenantContext.requireTenantId());
        return jdbc.query(SELECT + " where r.tenant_id = ? and r.order_id in (" + in + ") order by r.created_at desc", this::map, args.toArray());
    }

    // ------------------------------------------------------------------------------------------------ merchant

    @Transactional(readOnly = true)
    public Page<ReturnView> list(Status status, Pageable pageable) {
        UUID tenant = TenantContext.requireTenantId();
        String where = " where r.tenant_id = ?" + (status == null ? "" : " and r.status = '" + status.name() + "'");
        Long total = jdbc.queryForObject("select count(*) from return_requests r" + where, Long.class, tenant);
        List<ReturnView> rows = jdbc.query(SELECT + where + " order by r.created_at desc limit ? offset ?", this::map, tenant,
                pageable.getPageSize(), pageable.getOffset());
        return new PageImpl<>(rows, pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public long openCount() {
        Long n = jdbc.queryForObject("select count(*) from return_requests where tenant_id = ? and status in ('REQUESTED', 'ACCEPTED')",
                Long.class, TenantContext.requireTenantId());
        return n == null ? 0 : n;
    }

    @Transactional(readOnly = true)
    public ReturnView get(UUID id) {
        return jdbc.query(SELECT + " where r.tenant_id = ? and r.id = ?", this::map, TenantContext.requireTenantId(), id).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Nie znaleziono zgłoszenia."));
    }

    /** Accept or reject a new request; the note is shown to the customer (required when rejecting). */
    @Transactional
    public ReturnView decide(UUID id, boolean accept, String note, long version, UUID actor) {
        ReturnView r = get(id);
        if (r.status() != Status.REQUESTED) throw new BusinessRuleException("ALREADY_DECIDED", "To zgłoszenie zostało już rozpatrzone.");
        String n = trim(note, 2000);
        if (!accept && n == null) throw new BusinessRuleException("NOTE_REQUIRED", "Napisz klientowi, dlaczego zgłoszenie jest odrzucone.");
        Status target = accept ? Status.ACCEPTED : Status.REJECTED;
        update(id, version, "status = ?, merchant_note = ?, decided_at = now()", target.name(), n);
        auditLog.record(AuditEntry.tenant("orders.return." + target.name().toLowerCase(), TenantContext.requireTenantId(), "return", id).with(Map.of("actor", String.valueOf(actor))));
        events.publishEvent(new ReturnChanged(TenantContext.requireTenantId(), id, target));
        return get(id);
    }

    /** The goods are back and the money refunded. */
    @Transactional
    public ReturnView complete(UUID id, String note, long version, UUID actor) {
        ReturnView r = get(id);
        if (r.status() != Status.ACCEPTED) throw new BusinessRuleException("NOT_ACCEPTED", "Zakończyć można tylko przyjęte zgłoszenie.");
        String n = trim(note, 2000);
        update(id, version, "status = 'COMPLETED', completed_at = now(), merchant_note = coalesce(cast(? as varchar), merchant_note)", n);
        auditLog.record(AuditEntry.tenant("orders.return.completed", TenantContext.requireTenantId(), "return", id)
                .with(Map.of("actor", String.valueOf(actor))));
        events.publishEvent(new ReturnChanged(TenantContext.requireTenantId(), id, Status.COMPLETED));
        return get(id);
    }

    // ------------------------------------------------------------------------------------------------ internals

    private void update(UUID id, long version, String set, Object... args) {
        List<Object> all = new ArrayList<>(java.util.Arrays.asList(args));
        all.addAll(List.of(TenantContext.requireTenantId(), id, version));
        int n = jdbc.update("update return_requests set " + set + ", version = version + 1 where tenant_id = ? and id = ? and version = ?", all.toArray());
        if (n == 0) throw new ConflictException("VERSION_CONFLICT", "Zgłoszenie zostało w międzyczasie zmienione. Odśwież stronę.");
    }

    private static final String SELECT = """
            select r.*, o.number as order_number, o.email, o.first_name, o.last_name, o.currency
            from return_requests r join orders o on o.id = r.order_id and o.tenant_id = r.tenant_id
            """;

    private ReturnView map(ResultSet rs, int row) throws SQLException {
        UUID id = rs.getObject("id", UUID.class);
        List<Item> items = jdbc.query("""
                select i.order_item_id, oi.name, oi.variant_title, i.quantity, oi.unit_price_minor
                from return_request_items i join order_items oi on oi.id = i.order_item_id
                where i.return_id = ? order by oi.name
                """, (r, i) -> new Item(r.getObject(1, UUID.class), r.getString(2), r.getString(3), r.getInt(4), r.getLong(5)), id);
        long value = items.stream().mapToLong(i -> i.quantity() * i.unitPriceMinor()).sum();
        String name = ((rs.getString("first_name") == null ? "" : rs.getString("first_name")) + " "
                + (rs.getString("last_name") == null ? "" : rs.getString("last_name"))).strip();
        return new ReturnView(id, rs.getLong("number"), rs.getObject("order_id", UUID.class), rs.getLong("order_number"),
                Kind.valueOf(rs.getString("kind")), Status.valueOf(rs.getString("status")), rs.getString("reason"), rs.getString("refund_account"),
                rs.getString("merchant_note"), rs.getString("email"), name, value, rs.getString("currency"), items, ts(rs, "created_at"),
                ts(rs, "decided_at"), ts(rs, "completed_at"), rs.getLong("version"));
    }

    private static Instant ts(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static String trim(String s, int max) {
        if (s == null || s.isBlank()) return null;
        String t = s.strip();
        if (t.length() > max) throw new BusinessRuleException("TOO_LONG", "Tekst jest za długi (maks. " + max + " znaków).");
        return t;
    }
}

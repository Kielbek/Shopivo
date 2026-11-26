package pl.shopivo.reviews;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
import pl.shopivo.orders.Orders;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.ApiException;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Product reviews of the current store. Only verified buyers can write one: the customer gets a one-time link (hash
 * stored) after the order is completed, which lists exactly the products of that order. Every review waits for
 * moderation; the store can reply publicly.
 */
@Service
public class Reviews {

    static final Duration INVITATION_TTL = Duration.ofDays(90);

    private final JdbcTemplate jdbc;
    private final Orders orders;
    private final AuditLog auditLog;
    private final ApplicationEventPublisher events;

    Reviews(JdbcTemplate jdbc, Orders orders, AuditLog auditLog, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.orders = orders;
        this.auditLog = auditLog;
        this.events = events;
    }

    public enum Status { PENDING, APPROVED, REJECTED }

    /** Published after a customer submits a review (the store is notified after commit). */
    public record ReviewSubmitted(UUID tenantId, UUID reviewId) {
    }

    // ------------------------------------------------------------------------------------------------ invitations

    /** Creates the invitation of a completed order (idempotent) and returns the raw token, or null if one exists. */
    @Transactional
    public String invite(UUID orderId) {
        UUID tenant = TenantContext.requireTenantId();
        String token = Tokens.newToken();
        int inserted = jdbc.update("""
                insert into review_invitations (id, tenant_id, order_id, token_hash, expires_at) values (?, ?, ?, ?, ?)
                on conflict (order_id) do nothing
                """, UuidV7.generate(), tenant, orderId, Tokens.sha256(token), java.sql.Timestamp.from(Instant.now().plus(INVITATION_TTL)));
        return inserted == 1 ? token : null;
    }

    public record InvitationItem(UUID productId, String name, boolean reviewed) {
    }

    public record Invitation(long orderNumber, String suggestedAuthor, List<InvitationItem> items) {
    }

    @Transactional(readOnly = true)
    public Invitation invitation(String token) {
        OrderView order = orderFor(token);
        Set<UUID> reviewed = reviewedProducts(order.id());
        Map<UUID, InvitationItem> items = new java.util.LinkedHashMap<>();
        order.items().stream().filter(i -> i.productId() != null).forEach(i ->
                items.putIfAbsent(i.productId(), new InvitationItem(i.productId(), i.name(), reviewed.contains(i.productId()))));
        return new Invitation(order.number(), suggestedAuthor(order.firstName(), order.lastName()), List.copyOf(items.values()));
    }

    public record ReviewInput(UUID productId, Integer rating, String body, String authorName) {
    }

    @Transactional
    public void submit(String token, ReviewInput in) {
        OrderView order = orderFor(token);
        if (in.productId() == null || order.items().stream().noneMatch(i -> in.productId().equals(i.productId()))) {
            throw new BusinessRuleException("PRODUCT_NOT_IN_ORDER", "Ten produkt nie należy do zamówienia.");
        }
        if (in.rating() == null || in.rating() < 1 || in.rating() > 5) {
            throw new BusinessRuleException("INVALID_RATING", "Wybierz ocenę od 1 do 5 gwiazdek.");
        }
        String body = clean(in.body(), 2000, "Opinia");
        String author = clean(in.authorName(), 60, "Podpis");
        if (author == null) author = suggestedAuthor(order.firstName(), order.lastName());
        UUID id = UuidV7.generate();
        int inserted = jdbc.update("""
                insert into product_reviews (id, tenant_id, product_id, order_id, author_name, rating, body) values (?, ?, ?, ?, ?, ?, ?)
                on conflict (order_id, product_id) do nothing
                """, id, TenantContext.requireTenantId(), in.productId(), order.id(), author, in.rating(), body);
        if (inserted == 0) throw new ConflictException("ALREADY_REVIEWED", "Ten produkt został już oceniony.");
        events.publishEvent(new ReviewSubmitted(TenantContext.requireTenantId(), id));
    }

    private OrderView orderFor(String token) {
        if (token == null || token.isBlank() || token.length() > 100) throw invalidLink();
        record Inv(UUID orderId, Instant expires) {
        }
        Inv inv = jdbc.query("select order_id, expires_at from review_invitations where tenant_id = ? and token_hash = ?",
                (rs, i) -> new Inv(rs.getObject(1, UUID.class), rs.getTimestamp(2).toInstant()), TenantContext.requireTenantId(),
                Tokens.sha256(token)).stream().findFirst().orElseThrow(Reviews::invalidLink);
        if (inv.expires().isBefore(Instant.now())) {
            throw new ApiException(org.springframework.http.HttpStatus.GONE, "INVITATION_EXPIRED", "Link do wystawienia opinii wygasł.");
        }
        OrderView order = orders.get(inv.orderId());
        if (order.status() != OrderStatus.COMPLETED) throw invalidLink();
        return order;
    }

    private static NotFoundException invalidLink() {
        return new NotFoundException("Link do wystawienia opinii jest nieprawidłowy.");
    }

    private Set<UUID> reviewedProducts(UUID orderId) {
        return Set.copyOf(jdbc.query("select product_id from product_reviews where tenant_id = ? and order_id = ?",
                (rs, i) -> rs.getObject(1, UUID.class), TenantContext.requireTenantId(), orderId));
    }

    // ------------------------------------------------------------------------------------------------ public

    public record PublicReview(String authorName, int rating, String body, Instant createdAt, String reply, Instant repliedAt) {
    }

    public record Summary(double average, long count, long[] distribution) {
        public static final Summary EMPTY = new Summary(0, 0, new long[5]);
    }

    @Transactional(readOnly = true)
    public Summary summary(UUID productId) {
        return summaries(List.of(productId)).getOrDefault(productId, Summary.EMPTY);
    }

    /** Average and count of approved reviews per product (for product cards and pages). */
    @Transactional(readOnly = true)
    public Map<UUID, Summary> summaries(Collection<UUID> productIds) {
        Map<UUID, long[]> dist = new HashMap<>();
        if (productIds.isEmpty()) return Map.of();
        jdbc.query("""
                select product_id, rating, count(*) from product_reviews
                where tenant_id = ? and status = 'APPROVED' and product_id = any(?) group by product_id, rating
                """, rs -> {
                    dist.computeIfAbsent(rs.getObject(1, UUID.class), k -> new long[5])[rs.getInt(2) - 1] = rs.getLong(3);
                }, TenantContext.requireTenantId(), productIds.toArray(UUID[]::new));
        Map<UUID, Summary> result = new HashMap<>();
        dist.forEach((id, d) -> {
            long count = 0, sum = 0;
            for (int i = 0; i < 5; i++) {
                count += d[i];
                sum += d[i] * (i + 1);
            }
            result.put(id, new Summary(count == 0 ? 0 : Math.round(sum * 10.0 / count) / 10.0, count, d));
        });
        return result;
    }

    @Transactional(readOnly = true)
    public Page<PublicReview> approved(UUID productId, Pageable pageable) {
        UUID tenant = TenantContext.requireTenantId();
        Long total = jdbc.queryForObject("select count(*) from product_reviews where tenant_id = ? and product_id = ? and status = 'APPROVED'",
                Long.class, tenant, productId);
        List<PublicReview> items = jdbc.query("""
                select author_name, rating, body, created_at, reply, replied_at from product_reviews
                where tenant_id = ? and product_id = ? and status = 'APPROVED' order by created_at desc, id limit ? offset ?
                """, (rs, i) -> new PublicReview(rs.getString(1), rs.getInt(2), rs.getString(3), ts(rs, "created_at"), rs.getString(5),
                ts(rs, "replied_at")), tenant, productId, pageable.getPageSize(), pageable.getOffset());
        return new PageImpl<>(items, pageable, total == null ? 0 : total);
    }

    // ------------------------------------------------------------------------------------------------ moderation

    public record ReviewView(UUID id, UUID productId, String productName, UUID orderId, long orderNumber, String authorName, int rating,
            String body, Status status, String reply, Instant repliedAt, Instant moderatedAt, Instant createdAt) {
    }

    @Transactional(readOnly = true)
    public Page<ReviewView> list(Status status, Pageable pageable) {
        UUID tenant = TenantContext.requireTenantId();
        List<Object> args = new ArrayList<>(List.of(tenant));
        String where = " where r.tenant_id = ?";
        if (status != null) {
            where += " and r.status = ?";
            args.add(status.name());
        }
        Long total = jdbc.queryForObject("select count(*) from product_reviews r" + where, Long.class, args.toArray());
        args.add(pageable.getPageSize());
        args.add(pageable.getOffset());
        // Product name and order number come from the order's own snapshot (no cross-module joins on catalog tables).
        List<ReviewView> items = jdbc.query("""
                select r.*, o.number as order_number,
                    (select oi.name from order_items oi where oi.order_id = r.order_id and oi.product_id = r.product_id limit 1) as product_name
                from product_reviews r join orders o on o.id = r.order_id and o.tenant_id = r.tenant_id
                """ + where + " order by r.created_at desc, r.id limit ? offset ?", (rs, i) -> view(rs), args.toArray());
        return new PageImpl<>(items, pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public long pendingCount() {
        Long n = jdbc.queryForObject("select count(*) from product_reviews where tenant_id = ? and status = 'PENDING'", Long.class,
                TenantContext.requireTenantId());
        return n == null ? 0 : n;
    }

    @Transactional
    public ReviewView moderate(UUID id, Status status, UUID actor) {
        if (status == Status.PENDING) throw new BusinessRuleException("INVALID_STATUS", "Wybierz: opublikuj lub odrzuć.");
        UUID tenant = TenantContext.requireTenantId();
        if (jdbc.update("update product_reviews set status = ?, moderated_at = now(), moderated_by = ? where id = ? and tenant_id = ?",
                status.name(), actor, id, tenant) == 0) {
            throw new NotFoundException("Nie znaleziono opinii.");
        }
        auditLog.record(AuditEntry.tenant("review." + status.name().toLowerCase(), tenant, "review", id));
        return get(id);
    }

    @Transactional
    public ReviewView reply(UUID id, String reply) {
        UUID tenant = TenantContext.requireTenantId();
        String text = clean(reply, 2000, "Odpowiedź");
        if (jdbc.update("update product_reviews set reply = ?, replied_at = case when cast(? as text) is null then null else now() end where id = ? and tenant_id = ?",
                text, text, id, tenant) == 0) {
            throw new NotFoundException("Nie znaleziono opinii.");
        }
        auditLog.record(AuditEntry.tenant("review.replied", tenant, "review", id));
        return get(id);
    }

    @Transactional(readOnly = true)
    public ReviewView get(UUID id) {
        return jdbc.query("""
                select r.*, o.number as order_number,
                    (select oi.name from order_items oi where oi.order_id = r.order_id and oi.product_id = r.product_id limit 1) as product_name
                from product_reviews r join orders o on o.id = r.order_id and o.tenant_id = r.tenant_id
                where r.id = ? and r.tenant_id = ?
                """, (rs, i) -> view(rs), id, TenantContext.requireTenantId()).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Nie znaleziono opinii."));
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private static ReviewView view(ResultSet rs) throws SQLException {
        return new ReviewView(rs.getObject("id", UUID.class), rs.getObject("product_id", UUID.class), rs.getString("product_name"),
                rs.getObject("order_id", UUID.class), rs.getLong("order_number"), rs.getString("author_name"), rs.getInt("rating"),
                rs.getString("body"), Status.valueOf(rs.getString("status")), rs.getString("reply"), ts(rs, "replied_at"),
                ts(rs, "moderated_at"), ts(rs, "created_at"));
    }

    private static Instant ts(ResultSet rs, String col) throws SQLException {
        var t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    static String suggestedAuthor(String firstName, String lastName) {
        String f = firstName == null ? "" : firstName.strip();
        String l = lastName == null || lastName.isBlank() ? "" : " " + lastName.strip().charAt(0) + ".";
        String name = (f + l).strip();
        return name.isEmpty() ? "Klient" : name.length() > 60 ? name.substring(0, 60) : name;
    }

    private static String clean(String v, int max, String label) {
        if (v == null || v.isBlank()) return null;
        String s = v.replace("\r\n", "\n").strip();
        if (s.length() > max) throw new BusinessRuleException("TOO_LONG", label + ": najwyżej " + max + " znaków.");
        if (s.chars().anyMatch(ch -> ch < 0x20 && ch != '\n')) throw new BusinessRuleException("INVALID_CHARACTERS", label + " zawiera niedozwolone znaki.");
        return s;
    }
}

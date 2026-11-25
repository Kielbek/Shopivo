package pl.shopivo.customers;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/** Customers of the current store. Order statistics are maintained by the orders module. */
@Service
public class Customers {

    private final JdbcTemplate jdbc;
    private final AuditLog auditLog;

    Customers(JdbcTemplate jdbc, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.auditLog = auditLog;
    }

    public record CustomerView(UUID id, String email, String firstName, String lastName, String phone, boolean acceptsMarketing,
            Instant marketingConsentAt, String note, int ordersCount, long totalSpentMinor, Instant lastOrderAt,
            Instant createdAt, long version) {
    }

    public enum Sort { LAST_ORDER, NEWEST, TOTAL_SPENT, NAME }

    private static final RowMapper<CustomerView> MAPPER = (rs, i) -> new CustomerView(rs.getObject("id", UUID.class),
            rs.getString("email"), rs.getString("first_name"), rs.getString("last_name"), rs.getString("phone"),
            rs.getBoolean("accepts_marketing"), ts(rs.getTimestamp("marketing_consent_at")), rs.getString("note"),
            rs.getInt("orders_count"), rs.getLong("total_spent_minor"), ts(rs.getTimestamp("last_order_at")),
            ts(rs.getTimestamp("created_at")), rs.getLong("version"));

    /**
     * Finds or creates the customer for an order. Contact details are refreshed; a marketing consent given now is
     * recorded, but an earlier consent is never withdrawn implicitly.
     */
    @Transactional
    public UUID upsertFromOrder(String email, String firstName, String lastName, String phone, boolean marketingConsent) {
        UUID tenant = TenantContext.requireTenantId();
        Timestamp now = Timestamp.from(Instant.now());
        return jdbc.queryForObject("""
                insert into customers (id, tenant_id, email, first_name, last_name, phone, accepts_marketing, marketing_consent_at)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (tenant_id, lower(email)) do update set
                    first_name = excluded.first_name, last_name = excluded.last_name,
                    phone = coalesce(excluded.phone, customers.phone),
                    accepts_marketing = customers.accepts_marketing or excluded.accepts_marketing,
                    marketing_consent_at = coalesce(customers.marketing_consent_at, excluded.marketing_consent_at),
                    updated_at = now()
                returning id
                """, UUID.class, UuidV7.generate(), tenant, email.trim(), firstName, lastName, phone, marketingConsent,
                marketingConsent ? now : null);
    }

    /** Order placed (+1, +total) or canceled (-1, -total). */
    @Transactional
    public void recordOrder(UUID customerId, int countDelta, long totalDelta, Instant at) {
        jdbc.update("""
                update customers set orders_count = greatest(orders_count + ?, 0), total_spent_minor = greatest(total_spent_minor + ?, 0),
                    last_order_at = case when ? > 0 then ? else last_order_at end, updated_at = now()
                where id = ? and tenant_id = ?
                """, countDelta, totalDelta, countDelta, Timestamp.from(at), customerId, TenantContext.requireTenantId());
    }

    @Transactional(readOnly = true)
    public Page<CustomerView> search(String query, boolean marketingOnly, Sort sort, Pageable pageable) {
        StringBuilder where = new StringBuilder(" where tenant_id = ?");
        List<Object> args = new ArrayList<>(List.of(TenantContext.requireTenantId()));
        if (query != null && !query.isBlank()) {
            String like = "%" + query.trim().toLowerCase().replace("%", "\\%").replace("_", "\\_") + "%";
            where.append(" and (lower(email) like ? or lower(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) like ? or phone like ?)");
            args.add(like);
            args.add(like);
            args.add(like);
        }
        if (marketingOnly) where.append(" and accepts_marketing");
        Long total = jdbc.queryForObject("select count(*) from customers" + where, Long.class, args.toArray());
        String order = switch (sort == null ? Sort.LAST_ORDER : sort) {
            case LAST_ORDER -> "last_order_at desc nulls last";
            case NEWEST -> "created_at desc";
            case TOTAL_SPENT -> "total_spent_minor desc";
            case NAME -> "lower(last_name) nulls last, lower(first_name)";
        };
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        return new PageImpl<>(jdbc.query("select * from customers" + where + " order by " + order + ", id limit ? offset ?", MAPPER,
                pageArgs.toArray()), pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public CustomerView get(UUID id) {
        return jdbc.query("select * from customers where id = ? and tenant_id = ?", MAPPER, id, TenantContext.requireTenantId())
                .stream().findFirst().orElseThrow(() -> new NotFoundException("Nie znaleziono klienta."));
    }

    @Transactional
    public CustomerView updateNote(UUID id, String note, long version) {
        String n = note == null || note.isBlank() ? null : note.strip();
        if (n != null && n.length() > 2000) n = n.substring(0, 2000);
        int updated = jdbc.update("update customers set note = ?, version = version + 1, updated_at = now() where id = ? and tenant_id = ? and version = ?",
                n, id, TenantContext.requireTenantId(), version);
        if (updated == 0) {
            get(id);
            throw new ConflictException("VERSION_CONFLICT", "Dane klienta zostały w międzyczasie zmienione. Odśwież stronę.");
        }
        auditLog.record(AuditEntry.tenant("customer.note.updated", TenantContext.requireTenantId(), "customer", id));
        return get(id);
    }

    /** CSV of customers who consented to marketing (newsletter export). Semicolons, UTF-8 BOM. */
    @Transactional(readOnly = true)
    public String exportMarketingCsv() {
        StringBuilder csv = new StringBuilder("﻿email;imie;nazwisko;zgoda_od\n");
        jdbc.query("select email, first_name, last_name, marketing_consent_at from customers where tenant_id = ? and accepts_marketing order by lower(email)",
                rs -> {
                    csv.append(cell(rs.getString(1))).append(';').append(cell(rs.getString(2))).append(';')
                            .append(cell(rs.getString(3))).append(';').append(cell(String.valueOf(ts(rs.getTimestamp(4))))).append('\n');
                }, TenantContext.requireTenantId());
        auditLog.record(AuditEntry.tenant("customer.marketing.exported", TenantContext.requireTenantId(), "customer", null));
        return csv.toString();
    }

    static String cell(String v) {
        if (v == null || v.equals("null")) return "";
        String s = !v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0 ? "'" + v : v;
        return "\"" + s.replace("\"", "\"\"") + "\"";
    }

    private static Instant ts(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}

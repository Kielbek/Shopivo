package pl.shopivo.newsletter;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
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
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Newsletter sign-ups of the current store. Signing up never reveals whether an address is already on the list; a
 * confirmation link is sent at most once a day per address (no mail-bombing a stranger's inbox through the form).
 */
@Service
public class Newsletter {

    public static final String CONSENT_TEXT =
            "Zgoda na otrzymywanie informacji handlowych drogą elektroniczną (newsletter) od sklepu; możliwa do wycofania w każdej chwili.";
    static final Duration RESEND_AFTER = Duration.ofHours(24);
    static final Duration CONFIRM_TTL = Duration.ofDays(7);

    public enum Status { PENDING, CONFIRMED, UNSUBSCRIBED }

    public record Subscriber(UUID id, String email, Status status, String source, Instant createdAt, Instant confirmedAt, Instant unsubscribedAt) {
    }

    /** Sent after commit by the mailer: CONFIRM carries the link token, WELCOME the unsubscribe token. */
    public record NewsletterMail(UUID tenantId, Kind kind, String email, String token) {
        public enum Kind { CONFIRM, WELCOME }
    }

    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;
    private final AuditLog auditLog;

    Newsletter(JdbcTemplate jdbc, ApplicationEventPublisher events, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.events = events;
        this.auditLog = auditLog;
    }

    static String normalize(String raw) {
        String e = raw == null ? "" : raw.strip().toLowerCase(Locale.ROOT);
        if (e.length() > 320 || !e.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$")) {
            throw new BusinessRuleException("INVALID_EMAIL", "Podaj prawidłowy adres e-mail.");
        }
        return e;
    }

    /** Starts (or restarts) a sign-up. Always "accepted" to the caller. */
    @Transactional
    public void subscribe(String rawEmail, String source) {
        UUID tenant = TenantContext.requireTenantId();
        String email = normalize(rawEmail);
        record Row(UUID id, Status status, Instant sentAt) {
        }
        Row row = jdbc.query("select id, status, confirm_sent_at from newsletter_subscribers where tenant_id = ? and email = ? for update",
                (rs, i) -> new Row(rs.getObject(1, UUID.class), Status.valueOf(rs.getString(2)),
                        rs.getTimestamp(3) == null ? null : rs.getTimestamp(3).toInstant()), tenant, email).stream().findFirst().orElse(null);
        if (row != null && row.status() == Status.CONFIRMED) return;
        if (row != null && row.sentAt() != null && row.sentAt().isAfter(Instant.now().minus(RESEND_AFTER))) return;
        String token = Tokens.newToken();
        if (row == null) {
            jdbc.update("""
                    insert into newsletter_subscribers (id, tenant_id, email, status, confirm_token_hash, confirm_sent_at, source)
                    values (?, ?, ?, 'PENDING', ?, now(), ?) on conflict (tenant_id, email) do nothing
                    """, UuidV7.generate(), tenant, email, Tokens.sha256(token), source == null ? "storefront" : source);
        } else {
            jdbc.update("update newsletter_subscribers set status = 'PENDING', confirm_token_hash = ?, confirm_sent_at = now() where id = ? and tenant_id = ?",
                    Tokens.sha256(token), row.id(), tenant);
        }
        events.publishEvent(new NewsletterMail(tenant, NewsletterMail.Kind.CONFIRM, email, token));
    }

    /** The link from the confirmation e-mail: records the consent. */
    @Transactional
    public void confirm(String token) {
        UUID tenant = TenantContext.requireTenantId();
        String hash = token == null || token.isBlank() ? "-" : Tokens.sha256(token);
        record Row(UUID id, String email) {
        }
        Row row = jdbc.query("""
                select id, email from newsletter_subscribers where tenant_id = ? and confirm_token_hash = ? and status = 'PENDING'
                  and confirm_sent_at > ? for update
                """, (rs, i) -> new Row(rs.getObject(1, UUID.class), rs.getString(2)), tenant, hash,
                java.sql.Timestamp.from(Instant.now().minus(CONFIRM_TTL))).stream().findFirst()
                .orElseThrow(() -> new BusinessRuleException("TOKEN_INVALID", "Link wygasł lub został już użyty. Zapisz się ponownie."));
        String unsubscribe = Tokens.newToken();
        jdbc.update("""
                update newsletter_subscribers set status = 'CONFIRMED', confirmed_at = now(), confirm_token_hash = null, consent_text = ?,
                    unsubscribe_token_hash = ?, unsubscribed_at = null where id = ? and tenant_id = ?
                """, CONSENT_TEXT, Tokens.sha256(unsubscribe), row.id(), tenant);
        events.publishEvent(new NewsletterMail(tenant, NewsletterMail.Kind.WELCOME, row.email(), unsubscribe));
    }

    /** One-click unsubscribe from a link in the store's e-mails. Unknown tokens are ignored (no enumeration). */
    @Transactional
    public void unsubscribe(String token) {
        if (token == null || token.isBlank()) return;
        jdbc.update("""
                update newsletter_subscribers set status = 'UNSUBSCRIBED', unsubscribed_at = now()
                where tenant_id = ? and unsubscribe_token_hash = ? and status = 'CONFIRMED'
                """, TenantContext.requireTenantId(), Tokens.sha256(token));
    }

    // ------------------------------------------------------------------------------------------------ panel

    @Transactional(readOnly = true)
    public Page<Subscriber> list(Status status, String query, Pageable pageable) {
        UUID tenant = TenantContext.requireTenantId();
        String q = query == null || query.isBlank() ? null : "%" + query.strip().toLowerCase(Locale.ROOT).replace("%", "") + "%";
        String where = " where tenant_id = ?" + (status == null ? "" : " and status = '" + status.name() + "'") + (q == null ? "" : " and email like ?");
        Object[] args = q == null ? new Object[] {tenant} : new Object[] {tenant, q};
        Long total = jdbc.queryForObject("select count(*) from newsletter_subscribers" + where, Long.class, args);
        List<Object> pageArgs = new java.util.ArrayList<>(List.of(args));
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        List<Subscriber> items = jdbc.query("select * from newsletter_subscribers" + where + " order by created_at desc, id limit ? offset ?",
                (rs, i) -> new Subscriber(rs.getObject("id", UUID.class), rs.getString("email"), Status.valueOf(rs.getString("status")),
                        rs.getString("source"), rs.getTimestamp("created_at").toInstant(), ts(rs, "confirmed_at"), ts(rs, "unsubscribed_at")),
                pageArgs.toArray());
        return new PageImpl<>(items, pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public Map<Status, Long> counts() {
        Map<Status, Long> out = new java.util.EnumMap<>(Status.class);
        for (Status s : Status.values()) out.put(s, 0L);
        jdbc.query("select status, count(*) from newsletter_subscribers where tenant_id = ? group by status",
                rs -> { out.put(Status.valueOf(rs.getString(1)), rs.getLong(2)); }, TenantContext.requireTenantId());
        return out;
    }

    /** Confirmed subscribers as CSV with the proof of consent (date and wording). */
    @Transactional(readOnly = true)
    public String exportConfirmedCsv(UUID actor) {
        UUID tenant = TenantContext.requireTenantId();
        StringBuilder sb = new StringBuilder("email;potwierdzono;tresc_zgody\n");
        jdbc.query("select email, confirmed_at, consent_text from newsletter_subscribers where tenant_id = ? and status = 'CONFIRMED' order by confirmed_at",
                rs -> {
                    sb.append(csv(rs.getString(1))).append(';').append(rs.getTimestamp(2).toInstant()).append(';').append(csv(rs.getString(3))).append('\n');
                }, tenant);
        auditLog.record(AuditEntry.tenant("newsletter.exported", tenant, "newsletter", null).with(Map.of("by", String.valueOf(actor))));
        return sb.toString();
    }

    @Transactional
    public void delete(UUID id) {
        UUID tenant = TenantContext.requireTenantId();
        if (jdbc.update("delete from newsletter_subscribers where id = ? and tenant_id = ?", id, tenant) == 0) throw new NotFoundException();
        auditLog.record(AuditEntry.tenant("newsletter.subscriber.deleted", tenant, "newsletter", id));
    }

    private static Instant ts(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        var t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    /** Spreadsheet-safe CSV cell (no formula injection). */
    static String csv(String v) {
        if (v == null) return "";
        String s = v.replace("\"", "\"\"");
        if (!s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0) s = "'" + s;
        return "\"" + s + "\"";
    }
}

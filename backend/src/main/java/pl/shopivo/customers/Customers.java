package pl.shopivo.customers;

import java.sql.Array;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/** Customers of the current store. Order statistics are maintained by the orders module. */
@Service
public class Customers {

    static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]+\\.[^@\\s]{2,}$");
    private static final Pattern PHONE = Pattern.compile("^\\+?[0-9 ()-]{6,30}$");
    private static final Pattern COUNTRY = Pattern.compile("^[A-Z]{2}$");
    static final int MAX_TAGS = 20;
    static final int MAX_TAG_LENGTH = 40;

    private final JdbcTemplate jdbc;
    private final AuditLog auditLog;
    private final List<CustomerAccountLookup> accounts;

    Customers(JdbcTemplate jdbc, AuditLog auditLog, List<CustomerAccountLookup> accounts) {
        this.accounts = accounts;
        this.jdbc = jdbc;
        this.auditLog = auditLog;
    }

    /** Default address of a customer (any field may be empty). */
    public record Address(String company, String line1, String line2, String postalCode, String city, String countryCode) {

        boolean isEmpty() {
            return blank(company) && blank(line1) && blank(line2) && blank(postalCode) && blank(city);
        }
    }

    public enum ConsentSource { CHECKOUT, PANEL, IMPORT }

    public record CustomerView(UUID id, String email, String firstName, String lastName, String phone, boolean acceptsMarketing,
            Instant marketingConsentAt, ConsentSource marketingConsentSource, String note, Address address, List<String> tags,
            int ordersCount, long totalSpentMinor, Instant lastOrderAt, Instant createdAt, long version, Instant accountCreatedAt) {

        CustomerView withAccount(Instant at) {
            return new CustomerView(id, email, firstName, lastName, phone, acceptsMarketing, marketingConsentAt, marketingConsentSource, note,
                    address, tags, ordersCount, totalSpentMinor, lastOrderAt, createdAt, version, at);
        }
    }

    /** Data the merchant enters in the panel (create and edit). */
    public record CustomerInput(String email, String firstName, String lastName, String phone, boolean acceptsMarketing, String note,
            Address address, List<String> tags) {
    }

    public enum Sort { LAST_ORDER, NEWEST, TOTAL_SPENT, NAME }

    private static final RowMapper<CustomerView> MAPPER = (rs, i) -> new CustomerView(rs.getObject("id", UUID.class),
            rs.getString("email"), rs.getString("first_name"), rs.getString("last_name"), rs.getString("phone"),
            rs.getBoolean("accepts_marketing"), ts(rs.getTimestamp("marketing_consent_at")),
            rs.getString("marketing_consent_source") == null ? null : ConsentSource.valueOf(rs.getString("marketing_consent_source")),
            rs.getString("note"),
            new Address(rs.getString("company"), rs.getString("address_line1"), rs.getString("address_line2"), rs.getString("postal_code"),
                    rs.getString("city"), rs.getString("country_code")),
            tags(rs.getArray("tags")), rs.getInt("orders_count"), rs.getLong("total_spent_minor"), ts(rs.getTimestamp("last_order_at")),
            ts(rs.getTimestamp("created_at")), rs.getLong("version"), null);

    /**
     * Finds or creates the customer for an order. Contact details are refreshed; a marketing consent given now is
     * recorded, but an earlier consent is never withdrawn implicitly. The shipping address becomes the default address
     * only when the customer has none yet.
     */
    @Transactional
    public UUID upsertFromOrder(String email, String firstName, String lastName, String phone, boolean marketingConsent, Address address) {
        UUID tenant = TenantContext.requireTenantId();
        Timestamp now = Timestamp.from(Instant.now());
        Address a = address == null ? new Address(null, null, null, null, null, null) : address;
        return jdbc.queryForObject("""
                insert into customers (id, tenant_id, email, first_name, last_name, phone, accepts_marketing, marketing_consent_at,
                    marketing_consent_source, company, address_line1, address_line2, postal_code, city, country_code)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (tenant_id, lower(email)) do update set
                    first_name = excluded.first_name, last_name = excluded.last_name,
                    phone = coalesce(excluded.phone, customers.phone),
                    accepts_marketing = customers.accepts_marketing or excluded.accepts_marketing,
                    marketing_consent_at = coalesce(customers.marketing_consent_at, excluded.marketing_consent_at),
                    marketing_consent_source = coalesce(customers.marketing_consent_source, excluded.marketing_consent_source),
                    company = case when customers.address_line1 is null then excluded.company else customers.company end,
                    address_line2 = case when customers.address_line1 is null then excluded.address_line2 else customers.address_line2 end,
                    postal_code = case when customers.address_line1 is null then excluded.postal_code else customers.postal_code end,
                    city = case when customers.address_line1 is null then excluded.city else customers.city end,
                    country_code = case when customers.address_line1 is null then excluded.country_code else customers.country_code end,
                    address_line1 = coalesce(customers.address_line1, excluded.address_line1),
                    updated_at = now()
                returning id
                """, UUID.class, UuidV7.generate(), tenant, email.trim(), firstName, lastName, phone, marketingConsent,
                marketingConsent ? now : null, marketingConsent ? ConsentSource.CHECKOUT.name() : null, trim(a.company(), 200),
                trim(a.line1(), 200), trim(a.line2(), 200), trim(a.postalCode(), 20), trim(a.city(), 100),
                blank(a.line1()) ? null : country(a.countryCode(), true));
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
    public Page<CustomerView> search(String query, boolean marketingOnly, String tag, Sort sort, Pageable pageable) {
        StringBuilder where = new StringBuilder(" where tenant_id = ?");
        List<Object> args = new ArrayList<>(List.of(TenantContext.requireTenantId()));
        if (query != null && !query.isBlank()) {
            String like = "%" + query.trim().toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            where.append(" and (lower(email) like ? or lower(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) like ? or phone like ?"
                    + " or lower(coalesce(city, '')) like ? or lower(array_to_string(tags, ' ')) like ?)");
            for (int i = 0; i < 5; i++) args.add(like);
        }
        if (marketingOnly) where.append(" and accepts_marketing");
        if (tag != null && !tag.isBlank()) {
            where.append(" and exists (select 1 from unnest(tags) t where lower(t) = ?)");
            args.add(tag.strip().toLowerCase(Locale.ROOT));
        }
        Long total = jdbc.queryForObject("select count(*) from customers" + where, Long.class, args.toArray());
        String order = switch (sort == null ? Sort.LAST_ORDER : sort) {
            case LAST_ORDER -> "last_order_at desc nulls last, created_at desc";
            case NEWEST -> "created_at desc";
            case TOTAL_SPENT -> "total_spent_minor desc";
            case NAME -> "lower(last_name) nulls last, lower(first_name)";
        };
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        return new PageImpl<>(withAccounts(jdbc.query("select * from customers" + where + " order by " + order + ", id limit ? offset ?", MAPPER,
                pageArgs.toArray())), pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public CustomerView get(UUID id) {
        return withAccounts(jdbc.query("select * from customers where id = ? and tenant_id = ?", MAPPER, id, TenantContext.requireTenantId()))
                .stream().findFirst().orElseThrow(() -> new NotFoundException("Nie znaleziono klienta."));
    }

    /** All tags used in the store (for suggestions), most used first. */
    @Transactional(readOnly = true)
    public List<String> tags() {
        return jdbc.queryForList("""
                select t from customers, unnest(tags) t where tenant_id = ? group by t order by count(*) desc, lower(t) limit 200
                """, String.class, TenantContext.requireTenantId());
    }

    /** Customer added by the merchant. The marketing consent box records a consent the merchant has obtained (source PANEL). */
    @Transactional
    public CustomerView create(CustomerInput input) {
        Clean c = clean(input);
        UUID tenant = TenantContext.requireTenantId();
        UUID id = UuidV7.generate();
        try {
            jdbc.update("""
                    insert into customers (id, tenant_id, email, first_name, last_name, phone, accepts_marketing, marketing_consent_at,
                        marketing_consent_source, note, company, address_line1, address_line2, postal_code, city, country_code, tags)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, id, tenant, c.email, c.firstName, c.lastName, c.phone, c.marketing, c.marketing ? Timestamp.from(Instant.now()) : null,
                    c.marketing ? ConsentSource.PANEL.name() : null, c.note, c.address.company(), c.address.line1(), c.address.line2(),
                    c.address.postalCode(), c.address.city(), c.address.countryCode(), c.tags);
        } catch (DuplicateKeyException e) {
            throw emailTaken();
        }
        auditLog.record(AuditEntry.tenant("customer.created", tenant, "customer", id));
        return get(id);
    }

    /**
     * Edit by the merchant. The e-mail of a customer with a store account cannot be changed here (it is their login).
     * Unticking the consent withdraws it; ticking it records a new consent from the panel.
     */
    @Transactional
    public CustomerView update(UUID id, CustomerInput input, long version) {
        CustomerView current = get(id);
        Clean c = clean(input);
        if (current.accountCreatedAt() != null && !current.email().equalsIgnoreCase(c.email)) {
            throw new BusinessRuleException("EMAIL_IS_LOGIN", "Ten klient ma konto w sklepie — adres e-mail jest jego loginem i może go zmienić tylko on.");
        }
        boolean consentChanged = current.acceptsMarketing() != c.marketing;
        int updated;
        try {
            updated = jdbc.update("""
                    update customers set email = ?, first_name = ?, last_name = ?, phone = ?, note = ?, company = ?, address_line1 = ?,
                        address_line2 = ?, postal_code = ?, city = ?, country_code = ?, tags = ?,
                        accepts_marketing = ?,
                        marketing_consent_at = case when ? then (case when accepts_marketing then marketing_consent_at else now() end) else null end,
                        marketing_consent_source = case when ? then (case when accepts_marketing then marketing_consent_source else 'PANEL' end) else null end,
                        version = version + 1, updated_at = now()
                    where id = ? and tenant_id = ? and version = ?
                    """, c.email, c.firstName, c.lastName, c.phone, c.note, c.address.company(), c.address.line1(), c.address.line2(),
                    c.address.postalCode(), c.address.city(), c.address.countryCode(), c.tags, c.marketing, c.marketing, c.marketing,
                    id, TenantContext.requireTenantId(), version);
        } catch (DuplicateKeyException e) {
            throw emailTaken();
        }
        if (updated == 0) throw versionConflict();
        UUID tenant = TenantContext.requireTenantId();
        auditLog.record(AuditEntry.tenant("customer.updated", tenant, "customer", id));
        if (consentChanged) {
            auditLog.record(AuditEntry.tenant(c.marketing ? "customer.marketing.granted" : "customer.marketing.withdrawn", tenant, "customer", id));
        }
        return get(id);
    }

    @Transactional
    public CustomerView updateNote(UUID id, String note, long version) {
        String n = trim(note, 2000);
        int updated = jdbc.update("update customers set note = ?, version = version + 1, updated_at = now() where id = ? and tenant_id = ? and version = ?",
                n, id, TenantContext.requireTenantId(), version);
        if (updated == 0) {
            get(id);
            throw versionConflict();
        }
        auditLog.record(AuditEntry.tenant("customer.note.updated", TenantContext.requireTenantId(), "customer", id));
        return get(id);
    }

    /** Adds a tag to the selected customers (bulk action). Returns how many customers got it. */
    @Transactional
    public int addTag(Collection<UUID> ids, String tag) {
        String t = cleanTags(List.of(tag == null ? "" : tag)).stream().findFirst()
                .orElseThrow(() -> new BusinessRuleException("TAG_REQUIRED", "Podaj tag."));
        if (ids.isEmpty() || ids.size() > 500) throw new BusinessRuleException("SELECTION", "Zaznacz od 1 do 500 klientów.");
        UUID tenant = TenantContext.requireTenantId();
        int changed = jdbc.update("""
                update customers set tags = array_append(tags, ?), version = version + 1, updated_at = now()
                where tenant_id = ? and id = any(?) and not exists (select 1 from unnest(tags) x where lower(x) = lower(?))
                    and cardinality(tags) < ?
                """, t, tenant, ids.toArray(UUID[]::new), t, MAX_TAGS);
        auditLog.record(AuditEntry.tenant("customer.tagged", tenant, "customer", null));
        return changed;
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

    /**
     * Full customer list (or the selected customers) as CSV — the same columns the import accepts, so a file can be
     * exported, edited in a spreadsheet and imported back. Personal data: every export is audited.
     */
    @Transactional(readOnly = true)
    public String exportCsv(Collection<UUID> ids) {
        UUID tenant = TenantContext.requireTenantId();
        StringBuilder csv = new StringBuilder("﻿").append(String.join(";", CustomerImport.HEADER)).append('\n');
        String where = ids == null || ids.isEmpty() ? "" : " and id = any(?)";
        Object[] args = ids == null || ids.isEmpty() ? new Object[] {tenant} : new Object[] {tenant, ids.toArray(UUID[]::new)};
        for (CustomerView c : jdbc.query("select * from customers where tenant_id = ?" + where + " order by created_at", MAPPER, args)) {
            Address a = c.address();
            List<String> row = Arrays.asList(c.email(), c.firstName(), c.lastName(), c.phone(), a.company(), a.line1(), a.line2(),
                    a.postalCode(), a.city(), a.countryCode(), String.join(", ", c.tags()), c.acceptsMarketing() ? "tak" : "nie",
                    c.note(), String.valueOf(c.ordersCount()), String.format(Locale.ROOT, "%d.%02d", c.totalSpentMinor() / 100, c.totalSpentMinor() % 100));
            csv.append(String.join(";", row.stream().map(Customers::cell).toList())).append('\n');
        }
        auditLog.record(AuditEntry.tenant("customer.exported", tenant, "customer", null));
        return csv.toString();
    }

    /** Result of an import: counts and the first problems (line numbers as in the file). */
    public record ImportResult(int created, int updated, int skipped, List<String> errors) {
    }

    /**
     * Imports customers from CSV (see {@link CustomerImport}). Existing customers (same e-mail) are updated only with
     * non-empty values and get new tags added; nothing is deleted. Marketing consent from the file is recorded only
     * when the merchant confirms they hold those consents, and an import never withdraws a consent.
     */
    @Transactional
    public ImportResult importCsv(String content, boolean consentConfirmed) {
        List<CustomerImport.Row> rows = CustomerImport.parse(content);
        UUID tenant = TenantContext.requireTenantId();
        List<String> errors = new ArrayList<>();
        Map<String, CustomerImport.Row> unique = new LinkedHashMap<>();
        int skipped = 0;
        for (CustomerImport.Row r : rows) {
            try {
                String email = r.email() == null ? "" : r.email().strip();
                if (email.isEmpty() && r.isBlank()) continue;
                if (!EMAIL.matcher(email).matches() || email.length() > 320) throw new BusinessRuleException("INVALID_EMAIL", "nieprawidłowy e-mail");
                clean(new CustomerInput(email, r.firstName(), r.lastName(), r.phone(), false, r.note(), r.address(), r.tags()));
                unique.put(email.toLowerCase(Locale.ROOT), r);
            } catch (BusinessRuleException e) {
                skipped++;
                if (errors.size() < 50) errors.add("Wiersz " + r.line() + ": " + e.getMessage());
            }
        }
        Map<String, UUID> existing = new HashMap<>();
        if (!unique.isEmpty()) {
            jdbc.query("select id, lower(email) from customers where tenant_id = ? and lower(email) = any(?)",
                    rs -> { existing.put(rs.getString(2), rs.getObject(1, UUID.class)); }, tenant, unique.keySet().toArray(String[]::new));
        }
        int created = 0;
        int updated = 0;
        Timestamp now = Timestamp.from(Instant.now());
        for (var e : unique.entrySet()) {
            CustomerImport.Row r = e.getValue();
            boolean consent = consentConfirmed && r.acceptsMarketing();
            Clean c = clean(new CustomerInput(r.email().strip(), r.firstName(), r.lastName(), r.phone(), consent, r.note(), r.address(), r.tags()));
            UUID id = existing.get(e.getKey());
            if (id == null) {
                jdbc.update("""
                        insert into customers (id, tenant_id, email, first_name, last_name, phone, accepts_marketing, marketing_consent_at,
                            marketing_consent_source, note, company, address_line1, address_line2, postal_code, city, country_code, tags)
                        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, UuidV7.generate(), tenant, c.email, c.firstName, c.lastName, c.phone, consent, consent ? now : null,
                        consent ? ConsentSource.IMPORT.name() : null, c.note, c.address.company(), c.address.line1(), c.address.line2(),
                        c.address.postalCode(), c.address.city(), c.address.countryCode(), c.tags);
                created++;
            } else {
                boolean hasAddress = c.address.line1() != null;
                jdbc.update("""
                        update customers set first_name = coalesce(?, first_name), last_name = coalesce(?, last_name), phone = coalesce(?, phone),
                            note = coalesce(?, note),
                            company = case when ? then ? else company end, address_line1 = case when ? then ? else address_line1 end,
                            address_line2 = case when ? then ? else address_line2 end, postal_code = case when ? then ? else postal_code end,
                            city = case when ? then ? else city end, country_code = case when ? then ? else country_code end,
                            tags = (select coalesce(array_agg(t order by o), '{}') from (
                                        select distinct on (lower(t)) t, o from unnest(tags || ?::text[]) with ordinality u(t, o) order by lower(t), o) d
                                    ) [1:?],
                            accepts_marketing = accepts_marketing or ?,
                            marketing_consent_at = case when accepts_marketing then marketing_consent_at when ? then ? else null end,
                            marketing_consent_source = case when accepts_marketing then marketing_consent_source when ? then 'IMPORT' else null end,
                            version = version + 1, updated_at = now()
                        where id = ? and tenant_id = ?
                        """, c.firstName, c.lastName, c.phone, c.note, hasAddress, c.address.company(), hasAddress, c.address.line1(), hasAddress,
                        c.address.line2(), hasAddress, c.address.postalCode(), hasAddress, c.address.city(), hasAddress, c.address.countryCode(),
                        c.tags, MAX_TAGS, consent, consent, now, consent, id, tenant);
                updated++;
            }
        }
        auditLog.record(AuditEntry.tenant("customer.imported", tenant, "customer", null));
        return new ImportResult(created, updated, skipped, errors);
    }

    // ------------------------------------------------------------------ validation

    private record Clean(String email, String firstName, String lastName, String phone, boolean marketing, String note, Address address,
            String[] tags) {
    }

    private static Clean clean(CustomerInput in) {
        String email = in.email() == null ? "" : in.email().strip();
        if (!EMAIL.matcher(email).matches() || email.length() > 320) throw new BusinessRuleException("INVALID_EMAIL", "Nieprawidłowy adres e-mail.");
        String phone = trim(in.phone(), 30);
        if (phone != null && !PHONE.matcher(phone).matches()) throw new BusinessRuleException("INVALID_PHONE", "Nieprawidłowy numer telefonu.");
        String firstName = trim(in.firstName(), 100);
        String lastName = trim(in.lastName(), 100);
        String note = trim(in.note(), 2000);
        Address a = in.address() == null ? new Address(null, null, null, null, null, null) : in.address();
        Address address;
        if (a.isEmpty()) {
            address = new Address(null, null, null, null, null, null);
        } else {
            if (blank(a.line1()) || blank(a.postalCode()) || blank(a.city())) {
                throw new BusinessRuleException("ADDRESS_INCOMPLETE", "Adres musi mieć ulicę z numerem, kod pocztowy i miejscowość.");
            }
            address = new Address(trim(a.company(), 200), trim(a.line1(), 200), trim(a.line2(), 200), trim(a.postalCode(), 20), trim(a.city(), 100),
                    country(a.countryCode(), false));
        }
        return new Clean(email, firstName, lastName, phone, in.acceptsMarketing(), note, address,
                cleanTags(in.tags() == null ? List.of() : in.tags()).toArray(String[]::new));
    }

    /** Trimmed, without duplicates (case-insensitive), at most {@value #MAX_TAGS} tags of {@value #MAX_TAG_LENGTH} characters. */
    static List<String> cleanTags(List<String> tags) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String t : tags) {
            if (t == null) continue;
            String s = t.strip().replaceAll("\\s+", " ");
            if (s.isEmpty()) continue;
            if (s.length() > MAX_TAG_LENGTH) throw new BusinessRuleException("TAG_TOO_LONG", "Tag może mieć najwyżej " + MAX_TAG_LENGTH + " znaków.");
            out.putIfAbsent(s.toLowerCase(Locale.ROOT), s);
        }
        if (out.size() > MAX_TAGS) throw new BusinessRuleException("TOO_MANY_TAGS", "Klient może mieć najwyżej " + MAX_TAGS + " tagów.");
        return List.copyOf(out.values());
    }

    private static String country(String code, boolean lenient) {
        String c = code == null || code.isBlank() ? "PL" : code.strip().toUpperCase(Locale.ROOT);
        if (!COUNTRY.matcher(c).matches()) {
            if (lenient) return null;
            throw new BusinessRuleException("INVALID_COUNTRY", "Kraj podaj jako dwuliterowy kod, np. PL.");
        }
        return c;
    }

    private static ConflictException emailTaken() {
        return new ConflictException("EMAIL_TAKEN", "Klient z tym adresem e-mail już istnieje.");
    }

    private static ConflictException versionConflict() {
        return new ConflictException("VERSION_CONFLICT", "Dane klienta zostały w międzyczasie zmienione. Odśwież stronę.");
    }

    static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String trim(String s, int max) {
        if (s == null || s.isBlank()) return null;
        String v = s.strip();
        return v.length() > max ? v.substring(0, max) : v;
    }

    static String cell(String v) {
        if (v == null || v.equals("null")) return "";
        String s = !v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0 ? "'" + v : v;
        return "\"" + s.replace("\"", "\"\"") + "\"";
    }

    private static Instant ts(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    private static List<String> tags(Array a) throws SQLException {
        return a == null ? List.of() : List.of((String[]) a.getArray());
    }

    /** Marks customers who have a confirmed account in the store. */
    private List<CustomerView> withAccounts(List<CustomerView> list) {
        if (list.isEmpty() || accounts.isEmpty()) return list;
        Map<String, Instant> found = new HashMap<>();
        accounts.forEach(a -> found.putAll(a.verifiedAccountsCreatedAt(list.stream().map(c -> c.email().toLowerCase(Locale.ROOT)).toList())));
        return list.stream().map(c -> c.withAccount(found.get(c.email().toLowerCase(Locale.ROOT)))).toList();
    }
}

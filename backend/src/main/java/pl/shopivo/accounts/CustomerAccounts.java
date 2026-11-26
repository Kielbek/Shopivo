package pl.shopivo.accounts;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.orders.OrderModel.OrderView;
import pl.shopivo.orders.Orders;
import pl.shopivo.reviews.Reviews;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.ApiException;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.security.PasswordPolicy;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Customer accounts of the current store. An account sees orders placed with its e-mail, so logging in requires a
 * verified e-mail address. Registration and password reset never reveal whether an account exists.
 */
@Service
public class CustomerAccounts {

    static final Duration SESSION_TTL = Duration.ofDays(30);
    static final Duration VERIFY_TTL = Duration.ofHours(48);
    static final Duration RESET_TTL = Duration.ofHours(1);
    static final int MAX_FAILED_LOGINS = 5;
    static final Duration LOCK = Duration.ofMinutes(15);
    static final int MAX_ADDRESSES = 10;
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]+\\.[^@\\s]{2,}$");
    private static final Pattern POSTAL = Pattern.compile("^\\d{2}-\\d{3}$");

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final PasswordPolicy policy;
    private final Orders orders;
    private final Reviews reviews;
    private final ApplicationEventPublisher events;
    /** Compared against when the e-mail is unknown, so that response time does not reveal registered addresses. */
    private final String dummyHash;

    CustomerAccounts(JdbcTemplate jdbc, PasswordEncoder encoder, PasswordPolicy policy, Orders orders, Reviews reviews,
            ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.policy = policy;
        this.orders = orders;
        this.reviews = reviews;
        this.events = events;
        this.dummyHash = encoder.encode("timing-equaliser-" + UUID.randomUUID());
    }

    public record Account(UUID id, String email, String firstName, String lastName, String phone, boolean emailVerified, Instant createdAt) {
    }

    /** E-mail events, sent after commit: verification link, "you already have an account", password reset link. */
    public record AccountMail(UUID tenantId, Kind kind, String email, String firstName, String token) {
        public enum Kind { VERIFY, ALREADY_REGISTERED, RESET }
    }

    // ------------------------------------------------------------------------------------------------ registration

    public record Registration(String email, String password, String firstName, String lastName, boolean termsAccepted) {
    }

    @Transactional
    public void register(Registration r) {
        String email = email(r.email());
        String first = name(r.firstName(), "Imię");
        String last = name(r.lastName(), "Nazwisko");
        if (!r.termsAccepted()) throw new BusinessRuleException("TERMS_REQUIRED", "Zaakceptuj regulamin sklepu.");
        policy.validate(r.password(), email);
        String hash = encoder.encode(r.password());
        UUID tenant = TenantContext.requireTenantId();
        Optional<Row> existing = byEmail(email);
        if (existing.isPresent()) {
            Row a = existing.get();
            if (a.verifiedAt() != null) {
                events.publishEvent(new AccountMail(tenant, AccountMail.Kind.ALREADY_REGISTERED, email, a.firstName(), null));
            } else {
                // Not verified yet: nothing changes now. The link carries this registration's password; only the owner of the
                // mailbox can use it, and whichever link they open decides the password.
                issue(a.id(), "VERIFY", VERIFY_TTL, AccountMail.Kind.VERIFY, email, first, hash);
            }
            return;
        }
        UUID id = UuidV7.generate();
        jdbc.update("insert into customer_accounts (id, tenant_id, email, password_hash, first_name, last_name) values (?, ?, ?, ?, ?, ?)",
                id, tenant, email, hash, first, last);
        issue(id, "VERIFY", VERIFY_TTL, AccountMail.Kind.VERIFY, email, first, hash);
    }

    /**
     * Confirms the e-mail and signs the customer in. Besides the link (control of the mailbox) the password chosen in that
     * registration is required: if someone registered a stranger's address, the stranger opening the link cannot
     * activate an account whose password the other person knows. Returns a session token.
     */
    @Transactional
    public String verify(String token, String password) {
        Optional<String> pending = jdbc.query("""
                select pending_password_hash from customer_account_tokens
                where tenant_id = ? and token_hash = ? and purpose = 'VERIFY' and used_at is null and expires_at > now()
                """, (rs, i) -> rs.getString(1), TenantContext.requireTenantId(), token == null ? "" : Tokens.sha256(token)).stream().findFirst();
        if (pending.isEmpty()) {
            throw new BusinessRuleException("INVALID_TOKEN", "Link jest nieprawidłowy lub wygasł. Zarejestruj się ponownie, aby otrzymać nowy.");
        }
        if (password == null || pending.get() == null || !encoder.matches(password, pending.get())) {
            throw new BusinessRuleException("WRONG_PASSWORD", "Podaj hasło ustawione przy rejestracji.");
        }
        Consumed c = consume(token, "VERIFY").orElseThrow(() ->
                new BusinessRuleException("INVALID_TOKEN", "Link jest nieprawidłowy lub wygasł. Zarejestruj się ponownie, aby otrzymać nowy."));
        UUID tenant = TenantContext.requireTenantId();
        jdbc.update("""
                update customer_accounts set password_hash = coalesce(?, password_hash), email_verified_at = coalesce(email_verified_at, now()),
                    failed_logins = 0, locked_until = null, updated_at = now() where id = ? and tenant_id = ?
                """, c.pendingPasswordHash(), c.accountId(), tenant);
        // Other pending activation links (possibly from someone else's registration attempt) are void now.
        jdbc.update("delete from customer_account_tokens where tenant_id = ? and account_id = ? and purpose = 'VERIFY' and used_at is null",
                tenant, c.accountId());
        return newSession(c.accountId());
    }

    // ------------------------------------------------------------------------------------------------ sign-in

    @Transactional(noRollbackFor = ApiException.class)
    public String login(String rawEmail, String password) {
        String email = rawEmail == null ? "" : rawEmail.strip().toLowerCase(Locale.ROOT);
        Optional<Row> found = email.isEmpty() ? Optional.empty() : byEmail(email);
        if (found.isEmpty()) {
            encoder.matches(password == null ? "" : password, dummyHash);
            throw invalidCredentials();
        }
        Row a = found.get();
        UUID tenant = TenantContext.requireTenantId();
        if (a.lockedUntil() != null && a.lockedUntil().isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "ACCOUNT_LOCKED", "Zbyt wiele nieudanych prób. Spróbuj ponownie za kilkanaście minut.");
        }
        if (password == null || !encoder.matches(password, a.passwordHash())) {
            jdbc.update("""
                    update customer_accounts set failed_logins = failed_logins + 1,
                        locked_until = case when failed_logins + 1 >= ? then ? else locked_until end
                    where id = ? and tenant_id = ?
                    """, MAX_FAILED_LOGINS, Timestamp.from(Instant.now().plus(LOCK)), a.id(), tenant);
            throw invalidCredentials();
        }
        jdbc.update("update customer_accounts set failed_logins = 0, locked_until = null where id = ? and tenant_id = ?", a.id(), tenant);
        if (a.verifiedAt() == null) {
            // No new link from here: a fresh link always comes from a registration (which carries its own password).
            throw new ApiException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED",
                    "Konto nie jest jeszcze aktywne. Użyj linku z e-maila lub zarejestruj się ponownie, aby otrzymać nowy.");
        }
        if (encoder.upgradeEncoding(a.passwordHash())) {
            jdbc.update("update customer_accounts set password_hash = ? where id = ? and tenant_id = ?", encoder.encode(password), a.id(), tenant);
        }
        return newSession(a.id());
    }

    /** Account behind a session token (sliding last-seen), if valid. */
    @Transactional
    public Optional<Account> session(String token) {
        if (token == null || token.isBlank() || token.length() > 100) return Optional.empty();
        UUID tenant = TenantContext.requireTenantId();
        Optional<UUID> accountId = jdbc.query("""
                select account_id from customer_sessions where tenant_id = ? and token_hash = ? and expires_at > now()
                """, (rs, i) -> rs.getObject(1, UUID.class), tenant, Tokens.sha256(token)).stream().findFirst();
        if (accountId.isEmpty()) return Optional.empty();
        jdbc.update("update customer_sessions set last_seen_at = now() where tenant_id = ? and token_hash = ? and last_seen_at < now() - interval '5 minutes'",
                tenant, Tokens.sha256(token));
        return Optional.of(get(accountId.get()));
    }

    @Transactional
    public void logout(String token) {
        if (token == null) return;
        jdbc.update("delete from customer_sessions where tenant_id = ? and token_hash = ?", TenantContext.requireTenantId(), Tokens.sha256(token));
    }

    // ------------------------------------------------------------------------------------------------ password reset

    /** Always succeeds from the caller's view; a link is e-mailed only to an existing account. */
    @Transactional
    public void requestReset(String rawEmail) {
        if (rawEmail == null || rawEmail.length() > 254) return;
        byEmail(rawEmail.strip().toLowerCase(Locale.ROOT)).ifPresent(a ->
                issue(a.id(), "RESET", RESET_TTL, AccountMail.Kind.RESET, a.email(), a.firstName(), null));
    }

    @Transactional
    public void confirmReset(String token, String password) {
        UUID tenant = TenantContext.requireTenantId();
        Optional<UUID> id = peek(token, "RESET");
        if (id.isEmpty()) throw new BusinessRuleException("INVALID_TOKEN", "Link jest nieprawidłowy lub wygasł. Poproś o nowy.");
        Account a = get(id.get());
        policy.validate(password, a.email());
        if (consume(token, "RESET").isEmpty()) throw new BusinessRuleException("INVALID_TOKEN", "Link jest nieprawidłowy lub wygasł. Poproś o nowy.");
        // Resetting through the e-mail also proves the address.
        jdbc.update("""
                update customer_accounts set password_hash = ?, failed_logins = 0, locked_until = null,
                    email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = ? and tenant_id = ?
                """, encoder.encode(password), a.id(), tenant);
        jdbc.update("delete from customer_sessions where tenant_id = ? and account_id = ?", tenant, a.id());
    }

    // ------------------------------------------------------------------------------------------------ profile

    public record ProfileInput(String firstName, String lastName, String phone) {
    }

    @Transactional
    public Account updateProfile(UUID accountId, ProfileInput in) {
        String phone = in.phone() == null || in.phone().isBlank() ? null : in.phone().strip();
        if (phone != null && !phone.matches("^[+0-9 ()-]{6,30}$")) throw new BusinessRuleException("INVALID_PHONE", "Podaj prawidłowy numer telefonu.");
        jdbc.update("update customer_accounts set first_name = ?, last_name = ?, phone = ?, updated_at = now() where id = ? and tenant_id = ?",
                name(in.firstName(), "Imię"), name(in.lastName(), "Nazwisko"), phone, accountId, TenantContext.requireTenantId());
        return get(accountId);
    }

    /** Changes the password and signs out every other session. */
    @Transactional
    public void changePassword(UUID accountId, String currentToken, String current, String password) {
        Row a = byId(accountId);
        if (current == null || !encoder.matches(current, a.passwordHash())) {
            throw new BusinessRuleException("WRONG_PASSWORD", "Obecne hasło jest nieprawidłowe.");
        }
        policy.validate(password, a.email());
        UUID tenant = TenantContext.requireTenantId();
        jdbc.update("update customer_accounts set password_hash = ?, updated_at = now() where id = ? and tenant_id = ?", encoder.encode(password),
                accountId, tenant);
        jdbc.update("delete from customer_sessions where tenant_id = ? and account_id = ? and token_hash <> ?", tenant, accountId,
                Tokens.sha256(currentToken));
    }

    /** Deletes the account (RODO). Orders stay with the store — they are required by tax law. */
    @Transactional
    public void delete(UUID accountId, String password) {
        Row a = byId(accountId);
        if (password == null || !encoder.matches(password, a.passwordHash())) {
            throw new BusinessRuleException("WRONG_PASSWORD", "Hasło jest nieprawidłowe.");
        }
        jdbc.update("delete from customer_accounts where id = ? and tenant_id = ?", accountId, TenantContext.requireTenantId());
    }

    // ------------------------------------------------------------------------------------------------ addresses

    public record Address(UUID id, String name, String company, String line1, String line2, String postalCode, String city,
            String countryCode, String phone, boolean isDefault) {
    }

    @Transactional(readOnly = true)
    public List<Address> addresses(UUID accountId) {
        return jdbc.query("select * from customer_addresses where tenant_id = ? and account_id = ? order by is_default desc, created_at",
                (rs, i) -> new Address(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("company"), rs.getString("line1"),
                        rs.getString("line2"), rs.getString("postal_code"), rs.getString("city"), rs.getString("country_code"),
                        rs.getString("phone"), rs.getBoolean("is_default")), TenantContext.requireTenantId(), accountId);
    }

    @Transactional
    public List<Address> saveAddress(UUID accountId, UUID addressId, Address in) {
        UUID tenant = TenantContext.requireTenantId();
        String name = required(in.name(), 120, "Imię i nazwisko");
        String line1 = required(in.line1(), 200, "Ulica i numer");
        String city = required(in.city(), 100, "Miejscowość");
        String postal = in.postalCode() == null ? "" : in.postalCode().strip();
        if (!POSTAL.matcher(postal).matches()) throw new BusinessRuleException("INVALID_POSTAL_CODE", "Kod pocztowy w formacie 00-000.");
        if (addressId == null) {
            Integer n = jdbc.queryForObject("select count(*) from customer_addresses where tenant_id = ? and account_id = ?", Integer.class, tenant, accountId);
            if (n != null && n >= MAX_ADDRESSES) throw new BusinessRuleException("TOO_MANY_ADDRESSES", "Możesz zapisać najwyżej " + MAX_ADDRESSES + " adresów.");
            addressId = UuidV7.generate();
            jdbc.update("""
                    insert into customer_addresses (id, tenant_id, account_id, name, company, line1, line2, postal_code, city, country_code, phone, is_default)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PL', ?, ?)
                    """, addressId, tenant, accountId, name, optional(in.company(), 200), line1, optional(in.line2(), 200), postal, city,
                    optional(in.phone(), 30), in.isDefault() || n == null || n == 0);
        } else if (jdbc.update("""
                update customer_addresses set name = ?, company = ?, line1 = ?, line2 = ?, postal_code = ?, city = ?, phone = ?
                where id = ? and tenant_id = ? and account_id = ?
                """, name, optional(in.company(), 200), line1, optional(in.line2(), 200), postal, city, optional(in.phone(), 30),
                addressId, tenant, accountId) == 0) {
            throw new NotFoundException("Nie znaleziono adresu.");
        }
        if (in.isDefault()) {
            jdbc.update("update customer_addresses set is_default = (id = ?) where tenant_id = ? and account_id = ?", addressId, tenant, accountId);
        }
        return addresses(accountId);
    }

    @Transactional
    public List<Address> deleteAddress(UUID accountId, UUID addressId) {
        UUID tenant = TenantContext.requireTenantId();
        if (jdbc.update("delete from customer_addresses where id = ? and tenant_id = ? and account_id = ?", addressId, tenant, accountId) == 0) {
            throw new NotFoundException("Nie znaleziono adresu.");
        }
        jdbc.update("""
                update customer_addresses set is_default = true where id = (select id from customer_addresses where tenant_id = ? and account_id = ?
                    order by created_at limit 1) and not exists (select 1 from customer_addresses where tenant_id = ? and account_id = ? and is_default)
                """, tenant, accountId, tenant, accountId);
        return addresses(accountId);
    }

    // ------------------------------------------------------------------------------------------------ orders and reviews

    @Transactional(readOnly = true)
    public List<OrderView> orders(UUID accountId) {
        return orders.forEmail(verifiedEmail(accountId), 100);
    }

    @Transactional(readOnly = true)
    public OrderView order(UUID accountId, long number) {
        return orders.byNumberForEmail(number, verifiedEmail(accountId));
    }

    @Transactional(readOnly = true)
    public List<Reviews.Reviewable> reviewable(UUID accountId) {
        return reviews.reviewable(orders(accountId));
    }

    /** A review of a product bought in one of the account's own orders (verified purchase). */
    @Transactional
    public void review(UUID accountId, long orderNumber, Reviews.ReviewInput input) {
        reviews.submitForOrder(order(accountId, orderNumber), input);
    }

    // ------------------------------------------------------------------------------------------------ internals

    record Row(UUID id, String email, String passwordHash, String firstName, Instant verifiedAt, Instant lockedUntil) {
    }

    @Transactional(readOnly = true)
    public Account get(UUID id) {
        return jdbc.query("select * from customer_accounts where id = ? and tenant_id = ?", (rs, i) -> new Account(rs.getObject("id", UUID.class),
                rs.getString("email"), rs.getString("first_name"), rs.getString("last_name"), rs.getString("phone"),
                rs.getTimestamp("email_verified_at") != null, rs.getTimestamp("created_at").toInstant()), id, TenantContext.requireTenantId())
                .stream().findFirst().orElseThrow(() -> new NotFoundException("Nie znaleziono konta."));
    }

    private String verifiedEmail(UUID accountId) {
        Account a = get(accountId);
        if (!a.emailVerified()) throw new ApiException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED", "Potwierdź adres e-mail.");
        return a.email();
    }

    private Optional<Row> byEmail(String email) {
        return jdbc.query("select * from customer_accounts where tenant_id = ? and email = ?", (rs, i) -> row(rs),
                TenantContext.requireTenantId(), email).stream().findFirst();
    }

    private Row byId(UUID id) {
        return jdbc.query("select * from customer_accounts where tenant_id = ? and id = ?", (rs, i) -> row(rs), TenantContext.requireTenantId(), id)
                .stream().findFirst().orElseThrow(() -> new NotFoundException("Nie znaleziono konta."));
    }

    private static Row row(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp v = rs.getTimestamp("email_verified_at");
        Timestamp l = rs.getTimestamp("locked_until");
        return new Row(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("password_hash"), rs.getString("first_name"),
                v == null ? null : v.toInstant(), l == null ? null : l.toInstant());
    }

    private String newSession(UUID accountId) {
        String token = Tokens.newToken();
        UUID tenant = TenantContext.requireTenantId();
        jdbc.update("insert into customer_sessions (id, tenant_id, account_id, token_hash, expires_at) values (?, ?, ?, ?, ?)",
                UuidV7.generate(), tenant, accountId, Tokens.sha256(token), Timestamp.from(Instant.now().plus(SESSION_TTL)));
        return token;
    }

    /**
     * New single-use token and the e-mail event. A new reset link voids earlier ones; activation links stay independent
     * (each carries its own registration's password) until one of them is used.
     */
    private void issue(UUID accountId, String purpose, Duration ttl, AccountMail.Kind kind, String email, String firstName, String pendingHash) {
        UUID tenant = TenantContext.requireTenantId();
        if ("RESET".equals(purpose)) {
            jdbc.update("delete from customer_account_tokens where tenant_id = ? and account_id = ? and purpose = 'RESET' and used_at is null",
                    tenant, accountId);
        }
        String token = Tokens.newToken();
        jdbc.update("""
                insert into customer_account_tokens (id, tenant_id, account_id, purpose, token_hash, pending_password_hash, expires_at)
                values (?, ?, ?, ?, ?, ?, ?)
                """, UuidV7.generate(), tenant, accountId, purpose, Tokens.sha256(token), pendingHash, Timestamp.from(Instant.now().plus(ttl)));
        events.publishEvent(new AccountMail(tenant, kind, email, firstName, token));
    }

    private Optional<UUID> peek(String token, String purpose) {
        if (token == null || token.isBlank() || token.length() > 100) return Optional.empty();
        return jdbc.query("""
                select account_id from customer_account_tokens
                where tenant_id = ? and token_hash = ? and purpose = ? and used_at is null and expires_at > now()
                """, (rs, i) -> rs.getObject(1, UUID.class), TenantContext.requireTenantId(), Tokens.sha256(token), purpose).stream().findFirst();
    }

    record Consumed(UUID accountId, String pendingPasswordHash) {
    }

    private Optional<Consumed> consume(String token, String purpose) {
        if (token == null || token.isBlank() || token.length() > 100) return Optional.empty();
        return jdbc.query("""
                update customer_account_tokens set used_at = now()
                where tenant_id = ? and token_hash = ? and purpose = ? and used_at is null and expires_at > now()
                returning account_id, pending_password_hash
                """, (rs, i) -> new Consumed(rs.getObject(1, UUID.class), rs.getString(2)), TenantContext.requireTenantId(),
                Tokens.sha256(token), purpose).stream().findFirst();
    }

    private static ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Nieprawidłowy e-mail lub hasło.");
    }

    private static String email(String raw) {
        String e = raw == null ? "" : raw.strip().toLowerCase(Locale.ROOT);
        if (e.length() > 254 || !EMAIL.matcher(e).matches()) throw new BusinessRuleException("INVALID_EMAIL", "Podaj prawidłowy adres e-mail.");
        return e;
    }

    private static String name(String v, String label) {
        return required(v, 80, label);
    }

    private static String required(String v, int max, String label) {
        if (v == null || v.isBlank()) throw new BusinessRuleException("REQUIRED", label + ": pole wymagane.");
        String s = v.strip();
        if (s.length() > max) throw new BusinessRuleException("TOO_LONG", label + ": najwyżej " + max + " znaków.");
        if (s.chars().anyMatch(ch -> ch < 0x20)) throw new BusinessRuleException("INVALID_CHARACTERS", label + ": niedozwolone znaki.");
        return s;
    }

    private static String optional(String v, int max) {
        if (v == null || v.isBlank()) return null;
        String s = v.strip();
        if (s.length() > max) throw new BusinessRuleException("TOO_LONG", "Pole może mieć najwyżej " + max + " znaków.");
        return s;
    }
}

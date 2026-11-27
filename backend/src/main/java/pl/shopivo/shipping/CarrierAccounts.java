package pl.shopivo.shipping;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.crypto.SecretEncryptor;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shipping.CarrierModels.CarrierContext;
import pl.shopivo.shipping.CarrierModels.CarrierDescriptor;
import pl.shopivo.shipping.CarrierModels.CarrierException;
import pl.shopivo.shipping.CarrierModels.CredentialField;
import pl.shopivo.shipping.CarrierModels.CarrierService;
import pl.shopivo.orders.ShippingMethods;
import pl.shopivo.shared.config.ShopivoProperties;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * The store's carrier accounts. Secrets are encrypted (AES-GCM bound to store and carrier) and never returned — the
 * panel learns only which fields are filled. Any change disables the account until the connection is tested again.
 */
@Service
public class CarrierAccounts {

    private final JdbcTemplate jdbc;
    private final Map<String, CarrierAdapter> adapters;
    private final SecretEncryptor encryptor;
    private final JsonMapper json;
    private final AuditLog auditLog;
    private final ShippingMethods methods;
    private final org.springframework.data.redis.core.StringRedisTemplate redis;
    private final org.springframework.transaction.support.TransactionTemplate tx;
    private final ShopivoProperties properties;

    CarrierAccounts(JdbcTemplate jdbc, List<CarrierAdapter> adapters, SecretEncryptor encryptor, JsonMapper json, AuditLog auditLog,
            ShippingMethods methods, org.springframework.data.redis.core.StringRedisTemplate redis,
            org.springframework.transaction.support.TransactionTemplate tx, ShopivoProperties properties) {
        this.jdbc = jdbc;
        this.adapters = adapters.stream().collect(Collectors.toMap(CarrierAdapter::id, Function.identity()));
        this.encryptor = encryptor;
        this.json = json;
        this.auditLog = auditLog;
        this.methods = methods;
        this.redis = redis;
        this.tx = tx;
        this.properties = properties;
    }

    /** {@code services}: the services ticked on an aggregator account (empty for single carriers). */
    public record AccountState(String carrierId, String carrierName, boolean sandbox, boolean enabled, Instant verifiedAt,
            Map<String, Boolean> filled, long version, List<CarrierService> services) {
    }

    public record Overview(List<CarrierDescriptor> carriers, List<AccountState> accounts) {
    }

    record Stored(String carrierId, String encrypted, boolean sandbox, boolean enabled, Instant verifiedAt, long version, String servicesJson) {
    }

    @Transactional(readOnly = true)
    public Overview overview() {
        return new Overview(adapters.values().stream().map(CarrierAdapter::descriptor).sorted(Comparator.comparing(CarrierDescriptor::name)).toList(),
                stored().stream().map(this::state).toList());
    }

    public record SaveInput(Map<String, String> credentials, boolean sandbox, long version) {
    }

    @Transactional
    public AccountState save(String carrierId, SaveInput in) {
        CarrierAdapter adapter = adapter(carrierId);
        if (adapter.descriptor().oauth()) {
            throw new BusinessRuleException("USE_CONNECT", adapter.descriptor().name() + " łączysz przyciskiem „Połącz” — logując się na swoje konto.");
        }
        UUID tenant = TenantContext.requireTenantId();
        Optional<Stored> current = stored(carrierId);
        if (current.map(Stored::version).orElse(-1L) != in.version()) {
            throw new ConflictException("VERSION_CONFLICT", "Ustawienia zmieniły się w międzyczasie. Odśwież stronę.");
        }
        Map<String, String> values = new HashMap<>(current.map(this::decrypt).orElse(Map.of()));
        for (CredentialField f : adapter.descriptor().credentials()) {
            String v = in.credentials() == null ? null : in.credentials().get(f.key());
            if (v != null && !v.isBlank()) {
                if (v.length() > 1000) throw new BusinessRuleException("TOO_LONG", f.label() + ": wartość jest za długa.");
                values.put(f.key(), v.strip());
            }
        }
        values.keySet().retainAll(adapter.descriptor().credentials().stream().map(CredentialField::key).toList());
        jdbc.update("""
                insert into store_carrier_accounts (tenant_id, carrier_id, credentials_enc, sandbox, enabled) values (?, ?, ?, ?, false)
                on conflict (tenant_id, carrier_id) do update set credentials_enc = excluded.credentials_enc, sandbox = excluded.sandbox,
                    enabled = false, verified_at = null, updated_at = now(), version = store_carrier_accounts.version + 1
                """, tenant, adapter.id(), encryptor.encrypt(json.writeValueAsString(values), aad(tenant, adapter.id())), in.sandbox());
        auditLog.record(AuditEntry.tenant("shipping.carrier.saved", tenant, "carrier", null).with(Map.of("carrier", adapter.id())));
        return state(stored(adapter.id()).orElseThrow());
    }

    @Transactional
    public AccountState test(String carrierId) {
        Stored s = stored(carrierId).orElseThrow(() -> new BusinessRuleException("NOT_CONFIGURED", "Najpierw zapisz dane konta przewoźnika."));
        try {
            adapter(carrierId).testConnection(new CarrierContext(decrypt(s), s.sandbox()));
        } catch (CarrierException e) {
            throw new BusinessRuleException("CONNECTION_FAILED", e.getMessage());
        }
        jdbc.update("update store_carrier_accounts set verified_at = now() where tenant_id = ? and carrier_id = ?", TenantContext.requireTenantId(), carrierId);
        return state(stored(carrierId).orElseThrow());
    }

    @Transactional
    public AccountState setEnabled(String carrierId, boolean enabled) {
        Stored s = stored(carrierId).orElseThrow(() -> new BusinessRuleException("NOT_CONFIGURED", "Najpierw zapisz dane konta przewoźnika."));
        if (enabled && s.verifiedAt() == null) throw new BusinessRuleException("NOT_VERIFIED", "Najpierw sprawdź połączenie z przewoźnikiem.");
        UUID tenant = TenantContext.requireTenantId();
        jdbc.update("update store_carrier_accounts set enabled = ?, updated_at = now(), version = version + 1 where tenant_id = ? and carrier_id = ?",
                enabled, tenant, carrierId);
        auditLog.record(AuditEntry.tenant(enabled ? "shipping.carrier.enabled" : "shipping.carrier.disabled", tenant, "carrier", null)
                .with(Map.of("carrier", carrierId)));
        return state(stored(carrierId).orElseThrow());
    }

    /**
     * Module-internal: adapter and decrypted context of an enabled account. {@code service} is the aggregator service a
     * shipping method links to ("furgonetka:12345" → service 12345), null for single carriers.
     */
    record Active(CarrierAdapter adapter, CarrierContext context, boolean sandbox, CarrierService service) {
    }

    /** By carrier reference: the account id, or "account:service" for an aggregator service. */
    Optional<Active> active(String carrierRef) {
        String[] ref = split(carrierRef);
        return stored(ref[0]).filter(Stored::enabled).flatMap(s -> Optional.ofNullable(adapters.get(s.carrierId())).flatMap(a -> {
            CarrierService service = null;
            if (ref[1] != null) {
                service = services(s).stream().filter(x -> x.id().equals(ref[1])).findFirst().orElse(null);
                if (service == null) return Optional.empty(); // service no longer ticked
            }
            return Optional.of(new Active(a, new CarrierContext(fresh(a, s), s.sandbox()), s.sandbox(), service));
        }));
    }

    /** Carrier references a shipping method can link to: single carriers by id, aggregators per ticked service. */
    Map<String, String> enabledNames() {
        Map<String, String> names = new HashMap<>();
        stored().stream().filter(Stored::enabled).forEach(s -> {
            CarrierAdapter a = adapters.get(s.carrierId());
            if (a == null) return;
            if (a.descriptor().aggregator()) {
                services(s).forEach(x -> names.put(a.id() + ":" + x.id(), x.name() + " (" + a.descriptor().name() + ")"));
            } else {
                names.put(a.id(), a.descriptor().name());
            }
        });
        return names;
    }

    /** Whether the referenced carrier/service delivers this kind of method. */
    boolean supports(String carrierRef, pl.shopivo.orders.OrderModel.ShippingType type) {
        String[] ref = split(carrierRef);
        CarrierAdapter a = adapters.get(ref[0]);
        if (a == null) return false;
        if (ref[1] == null) return !a.descriptor().aggregator() && a.descriptor().services().contains(type);
        return stored(ref[0]).map(s -> services(s).stream().anyMatch(x -> x.id().equals(ref[1]) && x.types().contains(type))).orElse(false);
    }

    Optional<CarrierAdapter> adapterOf(String carrierRef) {
        return Optional.ofNullable(adapters.get(split(carrierRef)[0]));
    }

    static String[] split(String ref) {
        if (ref == null) return new String[] {"", null};
        int i = ref.indexOf(':');
        return i < 0 ? new String[] {ref, null} : new String[] {ref.substring(0, i), ref.substring(i + 1)};
    }

    // ------------------------------------------------------------------------------------------------ aggregator services

    /** A service on the account with what the store does with it: shipping methods linked to it (door / point). */
    public record ServiceView(CarrierService service, List<LinkedMethod> methods) {
    }

    public record LinkedMethod(java.util.UUID id, pl.shopivo.orders.OrderModel.ShippingType type, String name, long priceMinor,
            Long freeFromMinor, boolean active) {
    }

    /** One ticked delivery: a service in one delivery kind, with its price in the store. */
    public record ServiceChoice(String serviceId, pl.shopivo.orders.OrderModel.ShippingType type, String name, long priceMinor, Long freeFromMinor) {
    }

    /** Services available on the connected account (live from the carrier) and the store's shipping methods for them. */
    public List<ServiceView> services(String carrierId) {
        CarrierAdapter adapter = adapter(carrierId);
        Stored s = tx.execute(st -> stored(carrierId)).filter(x -> x.verifiedAt() != null)
                .orElseThrow(() -> new BusinessRuleException("NOT_VERIFIED", "Najpierw połącz konto " + adapter.descriptor().name() + "."));
        CarrierContext ctx = tx.execute(st -> new CarrierContext(fresh(adapter, s), s.sandbox()));
        List<CarrierService> live;
        try {
            live = adapter.services(ctx);
        } catch (CarrierException e) {
            throw new BusinessRuleException("CARRIER_ERROR", e.getMessage());
        }
        List<pl.shopivo.orders.OrderModel.ShippingMethodView> all = tx.execute(st -> methods.list(false));
        return live.stream().map(svc -> new ServiceView(svc, all.stream().filter(m -> (adapter.id() + ":" + svc.id()).equals(m.carrier()))
                .map(m -> new LinkedMethod(m.id(), m.type(), m.name(), m.priceMinor(), m.freeFromMinor(), m.active())).toList())).toList();
    }

    /**
     * Ticks services: each choice becomes (or updates) an active shipping method linked to "account:service"; methods of
     * services/kinds no longer ticked are switched off (kept for order history). The ticked services are remembered for
     * checkout (names, couriers, pickup points) without calling the carrier.
     */
    public List<ServiceView> saveServices(String carrierId, List<ServiceChoice> choices) {
        CarrierAdapter adapter = adapter(carrierId);
        if (!adapter.descriptor().aggregator()) throw new BusinessRuleException("NOT_AGGREGATOR", "Ten przewoźnik nie ma usług do wyboru.");
        if (choices == null || choices.size() > 30) throw new BusinessRuleException("TOO_MANY", "Wybierz najwyżej 30 usług.");
        Stored s = tx.execute(st -> stored(carrierId)).filter(x -> x.verifiedAt() != null)
                .orElseThrow(() -> new BusinessRuleException("NOT_VERIFIED", "Najpierw połącz konto " + adapter.descriptor().name() + "."));
        List<CarrierService> live;
        try {
            live = adapter.services(new CarrierContext(tx.execute(st -> fresh(adapter, s)), s.sandbox()));
        } catch (CarrierException e) {
            throw new BusinessRuleException("CARRIER_ERROR", e.getMessage());
        }
        Map<String, CarrierService> byId = live.stream().collect(Collectors.toMap(CarrierService::id, Function.identity(), (a, b) -> a));
        for (ServiceChoice c : choices) {
            CarrierService svc = byId.get(c.serviceId());
            if (svc == null) throw new BusinessRuleException("UNKNOWN_SERVICE", "Usługa nie jest dostępna na koncie przewoźnika.");
            if (c.type() == null || !svc.types().contains(c.type())) {
                throw new BusinessRuleException("UNSUPPORTED_TYPE", svc.name() + " nie obsługuje tego rodzaju dostawy.");
            }
            if (c.priceMinor() < 0 || c.priceMinor() > 1_000_000) throw new BusinessRuleException("INVALID_PRICE", "Podaj cenę dostawy.");
        }
        UUID tenant = TenantContext.requireTenantId();
        tx.executeWithoutResult(st -> {
            List<CarrierService> ticked = choices.stream().map(c -> byId.get(c.serviceId())).distinct().toList();
            List<pl.shopivo.orders.OrderModel.ShippingMethodView> existing = methods.list(false).stream()
                    .filter(m -> m.carrier() != null && m.carrier().startsWith(adapter.id() + ":")).toList();
            // 1) Switch off methods of unticked services while their link is still valid (kept for order history)
            for (var m : existing) {
                boolean kept = choices.stream().anyMatch(c -> (adapter.id() + ":" + c.serviceId()).equals(m.carrier()) && c.type() == m.type());
                if (!kept && m.active()) {
                    methods.update(m.id(), new ShippingMethods.ShippingInput(m.name(), m.description(), m.type(), m.priceMinor(), m.freeFromMinor(),
                            false, m.position(), m.version(), m.carrier()));
                }
            }
            // 2) Remember the ticked services (checkout names, couriers, pickup points) and enable the account
            jdbc.update("update store_carrier_accounts set services_json = ?, enabled = true, updated_at = now(), version = version + 1 where tenant_id = ? and carrier_id = ?",
                    json.writeValueAsString(ticked), tenant, adapter.id());
            // 3) Create or update a method per ticked service and delivery kind
            for (ServiceChoice c : choices) {
                String ref = adapter.id() + ":" + c.serviceId();
                String name = c.name() == null || c.name().isBlank() ? defaultName(byId.get(c.serviceId()), c.type()) : c.name().strip();
                var match = methods.list(false).stream().filter(m -> ref.equals(m.carrier()) && m.type() == c.type()).findFirst();
                var input = new ShippingMethods.ShippingInput(name, null, c.type(), c.priceMinor(), c.freeFromMinor(), true,
                        match.map(pl.shopivo.orders.OrderModel.ShippingMethodView::position).orElse(null),
                        match.map(pl.shopivo.orders.OrderModel.ShippingMethodView::version).orElse(0L), ref);
                if (match.isPresent()) methods.update(match.get().id(), input);
                else methods.create(input);
            }
            auditLog.record(AuditEntry.tenant("shipping.carrier.services", tenant, "carrier", null)
                    .with(Map.of("carrier", adapter.id(), "count", choices.size())));
        });
        return services(carrierId);
    }

    private static String defaultName(CarrierService svc, pl.shopivo.orders.OrderModel.ShippingType type) {
        return type == pl.shopivo.orders.OrderModel.ShippingType.PARCEL_LOCKER ? svc.name() + " — odbiór w punkcie" : svc.name() + " — kurier";
    }

    private List<CarrierService> services(Stored s) {
        try {
            return json.readValue(s.servicesJson() == null ? "[]" : s.servicesJson(), new TypeReference<List<CarrierService>>() { });
        } catch (RuntimeException e) {
            return List.of();
        }
    }

    // ------------------------------------------------------------------------------------------------ OAuth (Furgonetka)

    public record ConnectLink(String url) {
    }

    /** Starts signing in at the carrier: a single-use state (15 min) remembers the store; returns the carrier's page. */
    public ConnectLink connect(String carrierId, boolean sandbox) {
        CarrierAdapter adapter = adapter(carrierId);
        if (!adapter.descriptor().oauth()) throw new BusinessRuleException("NOT_OAUTH", "Ten przewoźnik wymaga danych dostępowych.");
        if (!adapter.descriptor().available()) {
            throw new BusinessRuleException("CARRIER_NOT_CONFIGURED", adapter.descriptor().name() + " nie jest jeszcze dostępna na platformie Shopivo.");
        }
        byte[] bytes = new byte[32];
        new java.security.SecureRandom().nextBytes(bytes);
        String state = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        redis.opsForValue().set("carrier-oauth:" + state, TenantContext.requireTenantId() + "|" + adapter.id() + "|" + sandbox,
                java.time.Duration.ofMinutes(15));
        try {
            return new ConnectLink(adapter.authorizationUrl(sandbox, redirectUri(adapter.id()), state));
        } catch (CarrierException e) {
            throw new BusinessRuleException("CARRIER_ERROR", e.getMessage());
        }
    }

    /**
     * The carrier's redirect after sign-in. Only a state we issued (once, within 15 min) is accepted; the code is
     * exchanged for tokens which are stored encrypted and verified. Returns the panel URL to send the merchant back to.
     */
    public String callback(String carrierId, String state, String code, String error) {
        String value = state == null || state.length() > 100 ? null : redis.opsForValue().getAndDelete("carrier-oauth:" + state);
        if (value == null) return properties.appUrl() + "/sklepy?blad=polaczenie-wygaslo";
        String[] parts = value.split("\\|");
        UUID tenant = UUID.fromString(parts[0]);
        boolean sandbox = Boolean.parseBoolean(parts[2]);
        String back = properties.appUrl() + "/sklep/" + tenant + "/wysylka";
        if (!parts[1].equals(carrierId)) return back + "?blad=polaczenie";
        if (error != null || code == null || code.isBlank()) return back + "?blad=anulowano";
        CarrierAdapter adapter = adapter(carrierId);
        CarrierModels.OAuthTokens tokens;
        try {
            tokens = adapter.exchangeCode(sandbox, code, redirectUri(carrierId));
            adapter.testConnection(new CarrierContext(Map.of("accessToken", tokens.accessToken()), sandbox));
        } catch (CarrierException e) {
            return back + "?blad=polaczenie";
        }
        TenantContext.runInTenant(tenant, () -> tx.executeWithoutResult(st -> {
            jdbc.update("""
                    insert into store_carrier_accounts (tenant_id, carrier_id, credentials_enc, sandbox, enabled, verified_at) values (?, ?, ?, ?, false, now())
                    on conflict (tenant_id, carrier_id) do update set credentials_enc = excluded.credentials_enc, sandbox = excluded.sandbox,
                        verified_at = now(), updated_at = now(), version = store_carrier_accounts.version + 1
                    """, tenant, carrierId, encryptor.encrypt(json.writeValueAsString(tokenMap(tokens)), aad(tenant, carrierId)), sandbox);
            auditLog.record(AuditEntry.tenant("shipping.carrier.connected", tenant, "carrier", null).with(Map.of("carrier", carrierId)));
        }));
        return back + "?polaczono=" + carrierId;
    }

    private String redirectUri(String carrierId) {
        return properties.publicApiUrl() + "/api/v1/oauth/carriers/" + carrierId + "/callback";
    }

    private static Map<String, String> tokenMap(CarrierModels.OAuthTokens t) {
        Map<String, String> m = new HashMap<>();
        m.put("accessToken", t.accessToken());
        if (t.refreshToken() != null) m.put("refreshToken", t.refreshToken());
        m.put("expiresAt", t.expiresAt().toString());
        return m;
    }

    /**
     * Credentials for a call; an OAuth token close to expiry (3 days) is refreshed first — under a row lock, because the
     * refresh token is single-use and two concurrent refreshes would lose the account.
     */
    private Map<String, String> fresh(CarrierAdapter adapter, Stored s) {
        Map<String, String> c = decrypt(s);
        if (!adapter.descriptor().oauth() || c.get("expiresAt") == null || c.get("refreshToken") == null) return c;
        if (Instant.parse(c.get("expiresAt")).isAfter(Instant.now().plus(java.time.Duration.ofDays(3)))) return c;
        UUID tenant = TenantContext.requireTenantId();
        Stored locked = jdbc.query("select * from store_carrier_accounts where tenant_id = ? and carrier_id = ? for update", (rs, i) -> row(rs),
                tenant, s.carrierId()).stream().findFirst().orElse(s);
        Map<String, String> current = decrypt(locked);
        if (Instant.parse(current.get("expiresAt")).isAfter(Instant.now().plus(java.time.Duration.ofDays(3)))) return current;
        try {
            CarrierModels.OAuthTokens t = adapter.refresh(locked.sandbox(), current.get("refreshToken"));
            jdbc.update("update store_carrier_accounts set credentials_enc = ?, updated_at = now() where tenant_id = ? and carrier_id = ?",
                    encryptor.encrypt(json.writeValueAsString(tokenMap(t)), aad(tenant, s.carrierId())), tenant, s.carrierId());
            return tokenMap(t);
        } catch (CarrierException e) {
            return current; // still valid until expiresAt; the next call retries
        }
    }

    private CarrierAdapter adapter(String id) {
        CarrierAdapter a = adapters.get(id == null ? "" : id);
        if (a == null) throw new BusinessRuleException("UNKNOWN_CARRIER", "Nieznany przewoźnik.");
        return a;
    }

    private List<Stored> stored() {
        return jdbc.query("select * from store_carrier_accounts where tenant_id = ? order by carrier_id", (rs, i) -> row(rs), TenantContext.requireTenantId());
    }

    private Optional<Stored> stored(String carrierId) {
        return jdbc.query("select * from store_carrier_accounts where tenant_id = ? and carrier_id = ?", (rs, i) -> row(rs),
                TenantContext.requireTenantId(), carrierId).stream().findFirst();
    }

    private static Stored row(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Stored(rs.getString("carrier_id"), rs.getString("credentials_enc"), rs.getBoolean("sandbox"), rs.getBoolean("enabled"),
                rs.getTimestamp("verified_at") == null ? null : rs.getTimestamp("verified_at").toInstant(), rs.getLong("version"),
                rs.getString("services_json"));
    }

    private AccountState state(Stored s) {
        CarrierAdapter a = adapters.get(s.carrierId());
        Map<String, String> values = decrypt(s);
        Map<String, Boolean> filled = new HashMap<>();
        if (a != null) a.descriptor().credentials().forEach(f -> filled.put(f.key(), values.containsKey(f.key())));
        return new AccountState(s.carrierId(), a == null ? s.carrierId() : a.descriptor().name(), s.sandbox(), s.enabled(), s.verifiedAt(),
                filled, s.version(), services(s));
    }

    private Map<String, String> decrypt(Stored s) {
        return json.readValue(encryptor.decrypt(s.encrypted(), aad(TenantContext.requireTenantId(), s.carrierId())),
                new TypeReference<Map<String, String>>() { });
    }

    private static String aad(UUID tenant, String carrier) {
        return "store-carrier-account:" + tenant + ":" + carrier;
    }

}

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

    CarrierAccounts(JdbcTemplate jdbc, List<CarrierAdapter> adapters, SecretEncryptor encryptor, JsonMapper json, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.adapters = adapters.stream().collect(Collectors.toMap(CarrierAdapter::id, Function.identity()));
        this.encryptor = encryptor;
        this.json = json;
        this.auditLog = auditLog;
    }

    public record AccountState(String carrierId, String carrierName, boolean sandbox, boolean enabled, Instant verifiedAt,
            Map<String, Boolean> filled, long version) {
    }

    public record Overview(List<CarrierDescriptor> carriers, List<AccountState> accounts) {
    }

    record Stored(String carrierId, String encrypted, boolean sandbox, boolean enabled, Instant verifiedAt, long version) {
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

    /** Module-internal: adapter and decrypted context of an enabled account. */
    record Active(CarrierAdapter adapter, CarrierContext context, boolean sandbox) {
    }

    Optional<Active> active(String carrierId) {
        return stored(carrierId).filter(Stored::enabled).flatMap(s -> Optional.ofNullable(adapters.get(s.carrierId()))
                .map(a -> new Active(a, new CarrierContext(decrypt(s), s.sandbox()), s.sandbox())));
    }

    Map<String, String> enabledNames() {
        Map<String, String> names = new HashMap<>();
        stored().stream().filter(Stored::enabled).forEach(s -> {
            CarrierAdapter a = adapters.get(s.carrierId());
            if (a != null) names.put(a.id(), a.descriptor().name());
        });
        return names;
    }

    Optional<CarrierAdapter> adapterOf(String carrierId) {
        return Optional.ofNullable(adapters.get(carrierId));
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
                rs.getTimestamp("verified_at") == null ? null : rs.getTimestamp("verified_at").toInstant(), rs.getLong("version"));
    }

    private AccountState state(Stored s) {
        CarrierAdapter a = adapters.get(s.carrierId());
        Map<String, String> values = decrypt(s);
        Map<String, Boolean> filled = new HashMap<>();
        if (a != null) a.descriptor().credentials().forEach(f -> filled.put(f.key(), values.containsKey(f.key())));
        return new AccountState(s.carrierId(), a == null ? s.carrierId() : a.descriptor().name(), s.sandbox(), s.enabled(), s.verifiedAt(),
                filled, s.version());
    }

    private Map<String, String> decrypt(Stored s) {
        return json.readValue(encryptor.decrypt(s.encrypted(), aad(TenantContext.requireTenantId(), s.carrierId())),
                new TypeReference<Map<String, String>>() { });
    }

    private static String aad(UUID tenant, String carrier) {
        return "store-carrier-account:" + tenant + ":" + carrier;
    }

}

package pl.shopivo.storepayments;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.payments.GatewayException;
import pl.shopivo.payments.PaymentGateway;
import pl.shopivo.payments.PaymentGatewayModels.CredentialField;
import pl.shopivo.payments.PaymentGatewayModels.GatewayContext;
import pl.shopivo.payments.PaymentGatewayModels.GatewayDescriptor;
import pl.shopivo.payments.PaymentGateways;
import pl.shopivo.shared.crypto.SecretEncryptor;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.tenancy.TenantContext;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * The store's payment operator account. Secrets are encrypted with AES-GCM bound to the store and operator (a ciphertext
 * copied to another store or operator does not decrypt) and are never returned by the API — only which fields are set.
 */
@Service
public class StorePaymentProviders {

    private final JdbcTemplate jdbc;
    private final PaymentGateways gateways;
    private final SecretEncryptor encryptor;
    private final JsonMapper json;
    private final AuditLog auditLog;

    StorePaymentProviders(JdbcTemplate jdbc, PaymentGateways gateways, SecretEncryptor encryptor, JsonMapper json, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.gateways = gateways;
        this.encryptor = encryptor;
        this.json = json;
        this.auditLog = auditLog;
    }

    /** What the panel may see: operator, environment, state, and which credential fields are filled (never their values). */
    public record ProviderState(String providerId, String providerName, boolean sandbox, boolean enabled, Instant verifiedAt,
            Map<String, Boolean> filled, long version) {
    }

    public record Overview(List<GatewayDescriptor> operators, ProviderState current) {
    }

    record Stored(String providerId, String encrypted, boolean sandbox, boolean enabled, Instant verifiedAt, long version) {
    }

    @Transactional(readOnly = true)
    public Overview overview() {
        return new Overview(gateways.all().stream().map(PaymentGateway::descriptor).toList(), stored().map(this::state).orElse(null));
    }

    public record SaveInput(String providerId, Map<String, String> credentials, boolean sandbox, long version) {
    }

    /**
     * Saves the account. Empty credential values keep what is stored (secrets are never sent back to the browser, so the
     * form leaves them blank). Changing anything disables payments until the connection is tested again.
     */
    @Transactional
    public ProviderState save(SaveInput in) {
        PaymentGateway gateway = gateways.find(in.providerId() == null ? "" : in.providerId())
                .orElseThrow(() -> new BusinessRuleException("UNKNOWN_OPERATOR", "Wybierz operatora płatności."));
        UUID tenant = TenantContext.requireTenantId();
        Optional<Stored> current = stored();
        long expected = current.map(Stored::version).orElse(-1L);
        if (expected != in.version()) throw new ConflictException("VERSION_CONFLICT", "Ustawienia zmieniły się w międzyczasie. Odśwież stronę.");
        Map<String, String> values = new HashMap<>();
        if (current.isPresent() && current.get().providerId().equals(gateway.id())) values.putAll(decrypt(current.get()));
        for (CredentialField f : gateway.descriptor().credentials()) {
            String v = in.credentials() == null ? null : in.credentials().get(f.key());
            if (v != null && !v.isBlank()) {
                if (v.length() > 500) throw new BusinessRuleException("TOO_LONG", f.label() + ": wartość jest za długa.");
                values.put(f.key(), v.strip());
            }
        }
        values.keySet().retainAll(gateway.descriptor().credentials().stream().map(CredentialField::key).toList());
        String encrypted = encryptor.encrypt(json.writeValueAsString(values), aad(tenant, gateway.id()));
        jdbc.update("""
                insert into store_payment_providers (tenant_id, provider_id, credentials_enc, sandbox, enabled)
                values (?, ?, ?, ?, false)
                on conflict (tenant_id) do update set provider_id = excluded.provider_id, credentials_enc = excluded.credentials_enc,
                    sandbox = excluded.sandbox, enabled = false, verified_at = null, updated_at = now(), version = store_payment_providers.version + 1
                """, tenant, gateway.id(), encrypted, in.sandbox());
        auditLog.record(AuditEntry.tenant("store.payments.provider.saved", tenant, "payment_provider", null)
                .with(Map.of("provider", gateway.id(), "sandbox", in.sandbox())));
        return stored().map(this::state).orElseThrow();
    }

    /** Checks the credentials with the operator; on success the account may be enabled. */
    @Transactional
    public ProviderState test() {
        Stored s = stored().orElseThrow(() -> new BusinessRuleException("NOT_CONFIGURED", "Najpierw zapisz dane operatora."));
        PaymentGateway gateway = gateways.get(s.providerId());
        try {
            gateway.testConnection(new GatewayContext(decrypt(s), s.sandbox()));
        } catch (GatewayException e) {
            throw new BusinessRuleException("CONNECTION_FAILED", "Operator odrzucił połączenie: " + e.getMessage());
        }
        jdbc.update("update store_payment_providers set verified_at = now() where tenant_id = ?", TenantContext.requireTenantId());
        return stored().map(this::state).orElseThrow();
    }

    @Transactional
    public ProviderState setEnabled(boolean enabled) {
        Stored s = stored().orElseThrow(() -> new BusinessRuleException("NOT_CONFIGURED", "Najpierw zapisz dane operatora."));
        if (enabled && s.verifiedAt() == null) {
            throw new BusinessRuleException("NOT_VERIFIED", "Najpierw sprawdź połączenie z operatorem.");
        }
        UUID tenant = TenantContext.requireTenantId();
        jdbc.update("update store_payment_providers set enabled = ?, updated_at = now(), version = version + 1 where tenant_id = ?", enabled, tenant);
        auditLog.record(AuditEntry.tenant(enabled ? "store.payments.enabled" : "store.payments.disabled", tenant, "payment_provider", null));
        return stored().map(this::state).orElseThrow();
    }

    /** Operator and context for payments and notifications (internal to this module). */
    record Active(PaymentGateway gateway, GatewayContext context, boolean enabled, boolean sandbox) {
    }

    Optional<Active> active() {
        return stored().flatMap(s -> gateways.find(s.providerId()).map(g -> new Active(g, new GatewayContext(decrypt(s), s.sandbox()),
                s.enabled(), s.sandbox())));
    }

    Optional<Stored> stored() {
        return jdbc.query("select * from store_payment_providers where tenant_id = ?", (rs, i) -> new Stored(rs.getString("provider_id"),
                rs.getString("credentials_enc"), rs.getBoolean("sandbox"), rs.getBoolean("enabled"),
                rs.getTimestamp("verified_at") == null ? null : rs.getTimestamp("verified_at").toInstant(), rs.getLong("version")),
                TenantContext.requireTenantId()).stream().findFirst();
    }

    private ProviderState state(Stored s) {
        Optional<PaymentGateway> g = gateways.find(s.providerId());
        Map<String, String> values = decrypt(s);
        Map<String, Boolean> filled = new HashMap<>();
        g.ifPresent(gw -> gw.descriptor().credentials().forEach(f -> filled.put(f.key(), values.containsKey(f.key()))));
        return new ProviderState(s.providerId(), g.map(gw -> gw.descriptor().name()).orElse(s.providerId()), s.sandbox(), s.enabled(),
                s.verifiedAt(), filled, s.version());
    }

    private Map<String, String> decrypt(Stored s) {
        return json.readValue(encryptor.decrypt(s.encrypted(), aad(TenantContext.requireTenantId(), s.providerId())),
                new TypeReference<Map<String, String>>() { });
    }

    private static String aad(UUID tenant, String provider) {
        return "store-payment-provider:" + tenant + ":" + provider;
    }
}

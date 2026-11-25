package pl.shopivo.billing;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.billing.internal.PlatformProviderEntity;
import pl.shopivo.billing.internal.PlatformProviderRepository;
import pl.shopivo.billing.internal.ProviderCredentials;
import pl.shopivo.payments.GatewayException;
import pl.shopivo.payments.PaymentGateway;
import pl.shopivo.payments.PaymentGatewayModels.CredentialField;
import pl.shopivo.payments.PaymentGatewayModels.GatewayDescriptor;
import pl.shopivo.payments.PaymentGateways;
import pl.shopivo.shared.error.BusinessRuleException;

/** Platform administration of payment operators used for subscription billing. Secrets are never returned. */
@Service
@Transactional
public class PlatformPaymentProviders {

    private final PlatformProviderRepository repository;
    private final ProviderCredentials credentials;
    private final PaymentGateways gateways;
    private final AuditLog auditLog;

    PlatformPaymentProviders(PlatformProviderRepository repository, ProviderCredentials credentials,
            PaymentGateways gateways, AuditLog auditLog) {
        this.repository = repository;
        this.credentials = credentials;
        this.gateways = gateways;
        this.auditLog = auditLog;
    }

    /** Field state without values: which credentials are set. */
    public record FieldState(String key, String label, boolean secret, String hint, boolean configured, String value) {
    }

    public record ProviderState(String id, String name, String description, String docsUrl, boolean enabled,
            boolean sandbox, boolean active, Instant lastTestAt, Boolean lastTestOk, List<FieldState> fields) {
    }

    @Transactional(readOnly = true)
    public List<ProviderState> list() {
        return gateways.all().stream().map(this::state).toList();
    }

    private ProviderState state(PaymentGateway gateway) {
        GatewayDescriptor d = gateway.descriptor();
        PlatformProviderEntity entity = repository.findById(d.id()).orElse(null);
        Map<String, String> values = entity == null ? Map.of() : credentials.decrypt(entity);
        List<FieldState> fields = d.credentials().stream().map(f -> new FieldState(f.key(), f.label(), f.secret(), f.hint(),
                values.containsKey(f.key()) && !values.get(f.key()).isBlank(),
                // Non-secret identifiers (merchant/POS ids) are shown; secrets never leave the server.
                f.secret() ? null : values.get(f.key()))).toList();
        return new ProviderState(d.id(), d.name(), d.description(), d.docsUrl(), entity != null && entity.isEnabled(),
                entity == null || entity.isSandbox(), entity != null && entity.isActiveForBilling(),
                entity == null ? null : entity.getLastTestAt(), entity == null ? null : entity.getLastTestOk(), fields);
    }

    /** Saves configuration. Empty secret values keep the stored secret (so it never has to be re-sent). */
    public ProviderState save(String providerId, boolean enabled, boolean sandbox, Map<String, String> submitted, UUID actor) {
        PaymentGateway gateway = gateways.get(providerId);
        PlatformProviderEntity entity = repository.findById(providerId).orElseGet(() -> new PlatformProviderEntity(providerId));
        Map<String, String> merged = new HashMap<>(credentials.decrypt(entity));
        for (CredentialField field : gateway.descriptor().credentials()) {
            String value = submitted.get(field.key());
            if (value != null && !value.isBlank()) {
                merged.put(field.key(), value.trim());
            } else if (!field.secret()) {
                merged.remove(field.key());
            }
        }
        if (enabled) {
            for (CredentialField field : gateway.descriptor().credentials()) {
                if (!field.key().equals("posId") && (merged.get(field.key()) == null || merged.get(field.key()).isBlank())) {
                    throw new BusinessRuleException("PROVIDER_INCOMPLETE", "Uzupełnij pole: " + field.label() + ".");
                }
            }
        }
        entity.configure(enabled, sandbox, credentials.encrypt(providerId, merged), actor);
        if (!enabled) entity.deactivate();
        repository.save(entity);
        auditLog.record(AuditEntry.platform("admin.payment_provider.updated", "payment_provider", providerId)
                .with(Map.of("enabled", enabled, "sandbox", sandbox)));
        return state(gateway);
    }

    public ProviderState activate(String providerId) {
        PaymentGateway gateway = gateways.get(providerId);
        PlatformProviderEntity entity = repository.findById(providerId)
                .filter(PlatformProviderEntity::isEnabled)
                .orElseThrow(() -> new BusinessRuleException("PROVIDER_NOT_ENABLED", "Najpierw skonfiguruj i włącz operatora."));
        repository.findActive().filter(p -> !p.getProvider().equals(providerId)).ifPresent(p -> {
            p.deactivate();
            repository.saveAndFlush(p);
        });
        entity.activate();
        auditLog.record(AuditEntry.platform("admin.payment_provider.activated", "payment_provider", providerId));
        return state(gateway);
    }

    @Transactional(noRollbackFor = GatewayException.class)
    public ProviderState test(String providerId) {
        PaymentGateway gateway = gateways.get(providerId);
        PlatformProviderEntity entity = repository.findById(providerId)
                .orElseThrow(() -> new BusinessRuleException("PROVIDER_NOT_CONFIGURED", "Operator nie jest skonfigurowany."));
        try {
            gateway.testConnection(credentials.context(entity));
            entity.recordTest(true);
        } catch (GatewayException e) {
            entity.recordTest(false);
            repository.saveAndFlush(entity);
            throw e;
        }
        return state(gateway);
    }
}

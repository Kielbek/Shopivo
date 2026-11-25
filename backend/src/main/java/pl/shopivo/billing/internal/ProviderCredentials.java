package pl.shopivo.billing.internal;

import java.util.Map;
import org.springframework.stereotype.Component;
import pl.shopivo.payments.PaymentGatewayModels.GatewayContext;
import pl.shopivo.shared.crypto.SecretEncryptor;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Encrypts operator credentials as one JSON document (AES-GCM, bound to the provider id as associated data). */
@Component
public class ProviderCredentials {

    private static final TypeReference<Map<String, String>> MAP = new TypeReference<>() {
    };

    private final SecretEncryptor encryptor;
    private final JsonMapper json;

    ProviderCredentials(SecretEncryptor encryptor, JsonMapper json) {
        this.encryptor = encryptor;
        this.json = json;
    }

    private static String aad(String provider) {
        return "platform-payment-provider:" + provider;
    }

    public String encrypt(String provider, Map<String, String> values) {
        return encryptor.encrypt(json.writeValueAsString(values), aad(provider));
    }

    public Map<String, String> decrypt(PlatformProviderEntity entity) {
        if (entity.getCredentialsEncrypted() == null) return Map.of();
        return json.readValue(encryptor.decrypt(entity.getCredentialsEncrypted(), aad(entity.getProvider())), MAP);
    }

    public GatewayContext context(PlatformProviderEntity entity) {
        return new GatewayContext(decrypt(entity), entity.isSandbox());
    }
}

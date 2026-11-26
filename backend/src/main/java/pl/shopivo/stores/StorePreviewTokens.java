package pl.shopivo.stores;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.config.ShopivoProperties;

/**
 * Short-lived signed tokens that let the merchant (and only someone they share the link with) see an unpublished
 * store and the draft theme. Stateless: {@code tenantId.expiry.hmac}; the HMAC key is derived from the platform
 * encryption keys, so tokens cannot be forged and stop working when keys rotate.
 */
@Component
public class StorePreviewTokens {

    public static final Duration TTL = Duration.ofHours(2);

    private final byte[] key;

    StorePreviewTokens(ShopivoProperties properties) {
        try {
            String material = properties.security() == null || properties.security().encryption() == null
                    ? null : properties.security().encryption().keys();
            // Never fall back to a constant key — tokens would be forgeable.
            if (material == null || material.isBlank()) {
                throw new IllegalStateException("shopivo.security.encryption.keys must be configured (store preview tokens)");
            }
            this.key = MessageDigest.getInstance("SHA-256").digest(("shopivo-store-preview:" + material).getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public String issue(UUID tenantId) {
        long expiry = Instant.now().plus(TTL).getEpochSecond();
        String payload = tenantId + "." + expiry;
        return payload + "." + sign(payload);
    }

    public boolean isValid(String token, UUID tenantId) {
        if (token == null || token.length() > 200) return false;
        String[] parts = token.split("\\.");
        if (parts.length != 3 || !parts[0].equals(tenantId.toString())) return false;
        try {
            if (Long.parseLong(parts[1]) < Instant.now().getEpochSecond()) return false;
        } catch (NumberFormatException e) {
            return false;
        }
        return MessageDigest.isEqual(sign(parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII),
                parts[2].getBytes(StandardCharsets.US_ASCII));
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}

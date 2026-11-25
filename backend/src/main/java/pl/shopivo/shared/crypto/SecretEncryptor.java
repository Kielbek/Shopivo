package pl.shopivo.shared.crypto;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.config.ShopivoProperties;

/**
 * AES-256-GCM encryption for secrets stored in the database (TOTP seeds, integration credentials).
 * Format: {@code v<keyVersion>:<base64(iv || ciphertext+tag)>}. The associated data binds a ciphertext
 * to its owner (e.g. tenant id or user id) so it cannot be copied to another record.
 */
@Component
public class SecretEncryptor {

    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;

    private final Map<Integer, SecretKey> keys = new HashMap<>();
    private final int activeVersion;

    public SecretEncryptor(ShopivoProperties properties) {
        ShopivoProperties.Encryption config = properties.security().encryption();
        if (config == null || config.keys() == null || config.keys().isBlank()) {
            throw new IllegalStateException("shopivo.security.encryption.keys (SHOPIVO_ENCRYPTION_KEYS) must be configured");
        }
        for (String entry : config.keys().split(",")) {
            String[] parts = entry.trim().split(":", 2);
            if (parts.length != 2) {
                throw new IllegalStateException("Invalid encryption key entry, expected '<version>:<base64>'");
            }
            byte[] key = Base64.getDecoder().decode(parts[1].trim());
            if (key.length != 32) {
                throw new IllegalStateException("Encryption key " + parts[0] + " must be 32 bytes (AES-256)");
            }
            keys.put(Integer.parseInt(parts[0].trim()), new SecretKeySpec(key, "AES"));
        }
        this.activeVersion = config.activeKey();
        if (!keys.containsKey(activeVersion)) {
            throw new IllegalStateException("Active encryption key version " + activeVersion + " is not configured");
        }
    }

    public String encrypt(String plaintext, String associatedData) {
        try {
            byte[] iv = new byte[IV_LENGTH];
            Tokens.random().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keys.get(activeVersion), new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(associatedData.getBytes(StandardCharsets.UTF_8));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] out = ByteBuffer.allocate(iv.length + ciphertext.length).put(iv).put(ciphertext).array();
            return "v" + activeVersion + ":" + Base64.getEncoder().encodeToString(out);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Encryption failed", e);
        }
    }

    public String decrypt(String encrypted, String associatedData) {
        int sep = encrypted.indexOf(':');
        if (!encrypted.startsWith("v") || sep < 2) {
            throw new IllegalArgumentException("Unsupported ciphertext format");
        }
        int version = Integer.parseInt(encrypted.substring(1, sep));
        SecretKey key = keys.get(version);
        if (key == null) {
            throw new IllegalStateException("Encryption key version " + version + " is not available");
        }
        try {
            byte[] data = Base64.getDecoder().decode(encrypted.substring(sep + 1));
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, data, 0, IV_LENGTH));
            cipher.updateAAD(associatedData.getBytes(StandardCharsets.UTF_8));
            byte[] plaintext = cipher.doFinal(data, IV_LENGTH, data.length - IV_LENGTH);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Decryption failed", e);
        }
    }

    public boolean needsReEncryption(String encrypted) {
        return !encrypted.startsWith("v" + activeVersion + ":");
    }
}

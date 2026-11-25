package pl.shopivo.shared.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;
import org.junit.jupiter.api.Test;
import pl.shopivo.shared.config.ShopivoProperties;

class SecretEncryptorTest {

    private static String key(int fill) {
        byte[] k = new byte[32];
        java.util.Arrays.fill(k, (byte) fill);
        return Base64.getEncoder().encodeToString(k);
    }

    private static SecretEncryptor encryptor(String keys, int active) {
        var enc = new ShopivoProperties.Encryption(keys, active);
        var security = new ShopivoProperties.Security(true, true, null, null, enc);
        return new SecretEncryptor(new ShopivoProperties(null, null, null, null, null, security, null, null));
    }

    @Test
    void roundTripsAndUsesRandomIv() {
        SecretEncryptor e = encryptor("1:" + key(1), 1);
        String a = e.encrypt("sk_live_123", "tenant-a");
        String b = e.encrypt("sk_live_123", "tenant-a");
        assertThat(a).startsWith("v1:").isNotEqualTo(b);
        assertThat(e.decrypt(a, "tenant-a")).isEqualTo("sk_live_123");
    }

    @Test
    void ciphertextIsBoundToAssociatedData() {
        SecretEncryptor e = encryptor("1:" + key(1), 1);
        String a = e.encrypt("secret", "tenant-a");
        assertThatThrownBy(() -> e.decrypt(a, "tenant-b")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void supportsKeyRotation() {
        String old = encryptor("1:" + key(1), 1).encrypt("secret", "x");
        SecretEncryptor rotated = encryptor("1:" + key(1) + ",2:" + key(2), 2);
        assertThat(rotated.decrypt(old, "x")).isEqualTo("secret");
        assertThat(rotated.needsReEncryption(old)).isTrue();
        assertThat(rotated.encrypt("secret", "x")).startsWith("v2:");
    }

    @Test
    void rejectsMissingOrShortKeys() {
        assertThatThrownBy(() -> encryptor("", 1)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> encryptor("1:" + Base64.getEncoder().encodeToString(new byte[16]), 1))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> encryptor("1:" + key(1), 2)).isInstanceOf(IllegalStateException.class);
    }
}

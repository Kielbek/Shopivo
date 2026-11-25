package pl.shopivo.authentication.internal;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.OptionalLong;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.apache.commons.codec.binary.Base32;
import pl.shopivo.shared.crypto.Tokens;

/** RFC 6238 TOTP (HMAC-SHA1, 30 s, 6 digits) — compatible with Google Authenticator, Authy, 1Password etc. */
final class Totp {

    static final int DIGITS = 6;
    static final int PERIOD_SECONDS = 30;
    private static final int ALLOWED_DRIFT_STEPS = 1;

    private Totp() {
    }

    static byte[] newSecret() {
        byte[] secret = new byte[20];
        Tokens.random().nextBytes(secret);
        return secret;
    }

    static String toBase32(byte[] secret) {
        return new Base32().encodeToString(secret).replace("=", "");
    }

    static byte[] fromBase32(String secret) {
        return new Base32().decode(secret);
    }

    static long currentStep(Instant now) {
        return now.getEpochSecond() / PERIOD_SECONDS;
    }

    static String code(byte[] key, long step) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
            int offset = hash[hash.length - 1] & 0x0F;
            int binary = ((hash[offset] & 0x7F) << 24) | ((hash[offset + 1] & 0xFF) << 16)
                    | ((hash[offset + 2] & 0xFF) << 8) | (hash[offset + 3] & 0xFF);
            return String.format("%0" + DIGITS + "d", binary % 1_000_000);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Verifies a code against the current step ± drift. Returns the matched step; steps not greater than
     * {@code lastUsedStep} are rejected to prevent replay of an already used code.
     */
    static OptionalLong verify(byte[] key, String code, Instant now, Long lastUsedStep) {
        if (code == null || !code.matches("\\d{" + DIGITS + "}")) {
            return OptionalLong.empty();
        }
        long current = currentStep(now);
        for (long step = current - ALLOWED_DRIFT_STEPS; step <= current + ALLOWED_DRIFT_STEPS; step++) {
            if (lastUsedStep != null && step <= lastUsedStep) {
                continue;
            }
            if (Tokens.constantTimeEquals(code(key, step), code)) {
                return OptionalLong.of(step);
            }
        }
        return OptionalLong.empty();
    }
}

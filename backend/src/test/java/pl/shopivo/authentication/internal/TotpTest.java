package pl.shopivo.authentication.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class TotpTest {

    // RFC 6238 Appendix B, SHA-1 secret "12345678901234567890"
    private static final byte[] RFC_SECRET = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

    @Test
    void matchesRfc6238TestVectors() {
        // RFC values are 8 digits; a 6-digit TOTP is the same truncation modulo 10^6.
        assertThat(Totp.code(RFC_SECRET, 59L / 30)).isEqualTo("287082");
        assertThat(Totp.code(RFC_SECRET, 1111111109L / 30)).isEqualTo("081804");
        assertThat(Totp.code(RFC_SECRET, 1234567890L / 30)).isEqualTo("005924");
        assertThat(Totp.code(RFC_SECRET, 2000000000L / 30)).isEqualTo("279037");
    }

    @Test
    void acceptsAdjacentStepAndRejectsReplay() {
        Instant now = Instant.ofEpochSecond(1_800_000_000L);
        long step = Totp.currentStep(now);
        String previous = Totp.code(RFC_SECRET, step - 1);

        assertThat(Totp.verify(RFC_SECRET, previous, now, null)).hasValue(step - 1);
        assertThat(Totp.verify(RFC_SECRET, previous, now, step - 1)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, step - 2), now, null)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, "12345", now, null)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, "abcdef", now, null)).isEmpty();
    }

    @Test
    void base32RoundTrip() {
        byte[] secret = Totp.newSecret();
        assertThat(Totp.fromBase32(Totp.toBase32(secret))).isEqualTo(secret);
        assertThat(Totp.toBase32(secret)).matches("[A-Z2-7]{32}");
    }
}

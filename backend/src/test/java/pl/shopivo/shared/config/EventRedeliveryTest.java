package pl.shopivo.shared.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class EventRedeliveryTest {

    private static final Instant NOW = Instant.parse("2026-11-26T12:00:00Z");

    @Test
    void retriesWithGrowingPauseAndStopsAfterTheLimit() {
        assertThat(SchedulingConfiguration.EventRedelivery.isDue(1, NOW.minus(Duration.ofMinutes(6)), NOW)).isTrue();
        assertThat(SchedulingConfiguration.EventRedelivery.isDue(3, NOW.minus(Duration.ofMinutes(15)), NOW)).isFalse(); // needs 20 min
        assertThat(SchedulingConfiguration.EventRedelivery.isDue(3, NOW.minus(Duration.ofMinutes(21)), NOW)).isTrue();
        assertThat(SchedulingConfiguration.EventRedelivery.isDue(9, NOW.minus(Duration.ofHours(5)), NOW)).isFalse(); // capped at 6 h
        assertThat(SchedulingConfiguration.EventRedelivery.isDue(9, NOW.minus(Duration.ofHours(7)), NOW)).isTrue();
        assertThat(SchedulingConfiguration.EventRedelivery.isDue(10, NOW.minus(Duration.ofDays(3)), NOW)).isFalse(); // dead letter
    }
}

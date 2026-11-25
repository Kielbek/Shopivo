package pl.shopivo.subscriptions.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import pl.shopivo.subscriptions.BillingInterval;

class BillingMathTest {

    private static ChargeEntity charge(long list, long discount) {
        Instant start = Instant.parse("2026-01-31T10:00:00Z");
        return new ChargeEntity(UUID.randomUUID(), "SUB-1", ChargeEntity.Kind.INITIAL, UUID.randomUUID(), UUID.randomUUID(),
                BillingInterval.MONTH, start, BillingInterval.MONTH.addTo(start), list, discount, 2300, "PLN", "x", null, start);
    }

    @Test
    void vatIsRoundedHalfUpOnTheNetAmount() {
        ChargeEntity c = charge(7900, 0);
        assertThat(c.getTaxMinor()).isEqualTo(1817);
        assertThat(c.getTotalMinor()).isEqualTo(9717);
        ChargeEntity half = charge(7900, 3950); // 3950 * 0.23 = 908.5 → 909
        assertThat(half.getTaxMinor()).isEqualTo(909);
        assertThat(half.getTotalMinor()).isEqualTo(4859);
    }

    @Test
    void monthlyPeriodsFollowTheCalendar() {
        assertThat(BillingInterval.MONTH.addTo(Instant.parse("2026-01-31T10:00:00Z"))).isEqualTo(Instant.parse("2026-02-28T10:00:00Z"));
        assertThat(BillingInterval.YEAR.addTo(Instant.parse("2028-02-29T00:00:00Z"))).isEqualTo(Instant.parse("2029-02-28T00:00:00Z"));
    }

    @Test
    void couponDurations() {
        CouponEntity once = new CouponEntity("A", null, 50, null, null, CouponEntity.Duration.ONCE, null, null, null);
        assertThat(once.appliesAfter(0, 1)).isTrue();
        assertThat(once.appliesAfter(1, 1)).isFalse();
        CouponEntity threeMonths = new CouponEntity("B", null, 10, null, null, CouponEntity.Duration.REPEATING, 3, null, null);
        assertThat(threeMonths.appliesAfter(2, 1)).isTrue();
        assertThat(threeMonths.appliesAfter(3, 1)).isFalse();
        assertThat(threeMonths.appliesAfter(0, 12)).isTrue(); // first yearly charge
        assertThat(threeMonths.appliesAfter(1, 12)).isFalse();
        CouponEntity fixed = new CouponEntity("C", null, null, 10_000L, "PLN", CouponEntity.Duration.FOREVER, null, 1, null);
        assertThat(fixed.discountFor(7900, "PLN")).isEqualTo(7900); // never more than the amount
        assertThat(fixed.discountFor(7900, "EUR")).isZero();
        fixed.redeem();
        assertThat(fixed.isRedeemable(Instant.now())).isFalse(); // max redemptions reached
    }
}

package pl.shopivo.subscriptions;

import java.time.Instant;
import java.time.ZoneOffset;

public enum BillingInterval {
    MONTH(1), YEAR(12);

    private final int months;

    BillingInterval(int months) {
        this.months = months;
    }

    public int months() {
        return months;
    }

    public Instant addTo(Instant start) {
        return start.atZone(ZoneOffset.UTC).plusMonths(months).toInstant();
    }
}

package pl.shopivo.stores;

import java.time.Instant;
import java.util.UUID;

public record StoreView(
        UUID id,
        UUID tenantId,
        String name,
        String slug,
        StoreStatus status,
        String defaultLocale,
        String defaultCurrency,
        String timezone,
        String contactEmail,
        String primaryHostname,
        Instant createdAt,
        long version) {
}

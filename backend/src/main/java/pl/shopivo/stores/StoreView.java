package pl.shopivo.stores;

import java.time.Instant;
import java.util.List;
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
        /** Primary industry (first of {@code industries}). */
        StoreIndustry industry,
        /** All industries, primary first (up to 5). */
        List<StoreIndustry> industries,
        Instant createdAt,
        long version) {
}

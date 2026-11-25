package pl.shopivo.shared.usage;

import java.util.UUID;

/**
 * Records resource usage per tenant (e.g. storefront requests). Implemented by the subscriptions module; must be
 * cheap and never fail the caller (fail-open).
 */
public interface UsageRecorder {

    void record(UUID tenantId, String metric, long delta);
}

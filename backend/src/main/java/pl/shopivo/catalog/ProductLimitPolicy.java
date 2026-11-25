package pl.shopivo.catalog;

import java.util.UUID;

/** Extension point: plan limit on the number of products (implemented by the subscriptions module). */
public interface ProductLimitPolicy {

    /** @param currentCount products that count towards the limit (not archived). Throws an ApiException (402) when full. */
    void checkCanAddProduct(UUID tenantId, long currentCount);
}

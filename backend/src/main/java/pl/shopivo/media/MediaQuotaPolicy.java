package pl.shopivo.media;

import java.util.UUID;

/** Extension point: storage limit of the store's plan (implemented by the subscriptions module). */
public interface MediaQuotaPolicy {

    /** Throws an ApiException (402) when {@code usedBytes + newBytes} exceeds the plan limit. */
    void checkCanStore(UUID tenantId, long usedBytes, long newBytes);
}

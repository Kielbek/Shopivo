package pl.shopivo.stores;

import java.util.UUID;

/** Extension point: whether the public storefront of a tenant is served (e.g. not after the subscription expired). */
public interface StorefrontAvailabilityPolicy {

    boolean isAvailable(UUID tenantId);
}

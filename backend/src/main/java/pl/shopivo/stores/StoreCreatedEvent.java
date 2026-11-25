package pl.shopivo.stores;

import java.util.UUID;

/** Published synchronously inside the store-creation transaction (tenant context bound). */
public record StoreCreatedEvent(UUID tenantId, UUID storeId, UUID ownerUserId) {
}

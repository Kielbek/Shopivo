package pl.shopivo.tenants;

import java.util.UUID;

/**
 * Extension point: whether the tenant may perform state-changing operations (e.g. false when the subscription has
 * expired — the store becomes read-only except for billing).
 */
public interface TenantWriteAccessPolicy {

    boolean canWrite(UUID tenantId);
}

package pl.shopivo.tenants;

import java.util.UUID;

/** Extension point: limits the team size (implemented by the subscriptions module from plan entitlements). */
public interface TeamSizePolicy {

    /** @param currentSize active members plus pending invitations. Throws an ApiException (402) when full. */
    void checkCanAddMember(UUID tenantId, long currentSize);
}

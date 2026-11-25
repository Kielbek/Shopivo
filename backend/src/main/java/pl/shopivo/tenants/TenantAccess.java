package pl.shopivo.tenants;

import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

/**
 * Authorization helper for tenant-scoped endpoints, used in SpEL: {@code @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")}.
 * The membership is resolved and verified by {@link TenantAccessFilter} before the controller runs.
 */
@Component("tenantAccess")
public class TenantAccess {

    static final String MEMBERSHIP_ATTRIBUTE = TenantAccess.class.getName() + ".membership";

    public boolean can(String permission) {
        return currentMembership().map(m -> m.role().has(StorePermission.valueOf(permission))).orElse(false);
    }

    public static Optional<MembershipView> currentMembership() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            return Optional.empty();
        }
        return Optional.ofNullable((MembershipView) attrs.getAttribute(MEMBERSHIP_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST));
    }

    public static MembershipView requireMembership() {
        return currentMembership().orElseThrow(() -> new IllegalStateException("No tenant membership bound"));
    }
}

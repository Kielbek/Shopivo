package pl.shopivo.tenants;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.filter.OncePerRequestFilter;
import pl.shopivo.shared.error.ProblemDetails;
import pl.shopivo.shared.security.CurrentUser;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;
import tools.jackson.databind.json.JsonMapper;

/**
 * Resolves the tenant for {@code /api/v1/tenants/{tenantId}/**}: the authenticated user must have an active
 * membership in an active tenant. Otherwise the request ends with 404 (the existence of other stores is not
 * revealed). On success the tenant is bound to {@link TenantContext} for the rest of the request.
 */
public class TenantAccessFilter extends OncePerRequestFilter {

    private static final Pattern TENANT_PATH = Pattern.compile("^/api/v1/tenants/([^/]+)(/.*)?$");

    private final TenantMemberships memberships;
    private final JsonMapper jsonMapper;
    private final java.util.List<TenantWriteAccessPolicy> writePolicies;

    public TenantAccessFilter(TenantMemberships memberships, JsonMapper jsonMapper,
            java.util.List<TenantWriteAccessPolicy> writePolicies) {
        this.memberships = memberships;
        this.jsonMapper = jsonMapper;
        this.writePolicies = writePolicies;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/v1/tenants/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Matcher matcher = TENANT_PATH.matcher(request.getRequestURI());
        Optional<CurrentUser> user = SecurityUtils.currentUser();
        if (!matcher.matches() || user.isEmpty() || user.get().mfaPending()) {
            // Unauthenticated requests are rejected later by the authorization rules (401).
            chain.doFilter(request, response);
            return;
        }
        UUID tenantId;
        try {
            tenantId = UUID.fromString(matcher.group(1));
        } catch (IllegalArgumentException e) {
            notFound(response);
            return;
        }
        Optional<MembershipView> membership = memberships.findActiveMembership(user.get().id(), tenantId);
        if (membership.isEmpty()) {
            notFound(response);
            return;
        }
        if (isWrite(request) && !allowedWhenReadOnly(matcher.group(2)) && writePolicies.stream().anyMatch(p -> !p.canWrite(tenantId))) {
            writeProblem(response, HttpStatus.PAYMENT_REQUIRED, "SUBSCRIPTION_INACTIVE",
                    "Subskrypcja sklepu wygasła — sklep działa w trybie tylko do odczytu. Opłać subskrypcję, aby wprowadzać zmiany.");
            return;
        }
        request.setAttribute(TenantAccess.MEMBERSHIP_ATTRIBUTE, membership.get());
        TenantContext.bindTenant(tenantId);
        MDC.put("tenantId", tenantId.toString());
        try {
            chain.doFilter(request, response);
        } finally {
            TenantContext.bindTenant(null);
            MDC.remove("tenantId");
        }
    }

    private static boolean isWrite(HttpServletRequest request) {
        String m = request.getMethod();
        return !("GET".equals(m) || "HEAD".equals(m) || "OPTIONS".equals(m));
    }

    private static final java.util.regex.Pattern ORDER_FULFILMENT =
            java.util.regex.Pattern.compile("^/orders/[0-9a-fA-F-]{36}/(status|paid|refunded|notes)$");

    /**
     * Writes still allowed for a read-only store: billing (otherwise the merchant could never pay) and handling of
     * orders customers already placed (shipping, payment, cancellation) — obligations towards consumers do not end
     * with the subscription. Creating new orders, products etc. stays blocked.
     */
    static boolean allowedWhenReadOnly(String rest) {
        return rest != null && (rest.startsWith("/subscription") || ORDER_FULFILMENT.matcher(rest).matches());
    }

    private void notFound(HttpServletResponse response) throws IOException {
        writeProblem(response, HttpStatus.NOT_FOUND, "NOT_FOUND", "Nie znaleziono sklepu.");
    }

    private void writeProblem(HttpServletResponse response, HttpStatus status, String code, String detail) throws IOException {
        ProblemDetail problem = ProblemDetails.of(status, code, detail);
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        jsonMapper.writeValue(response.getOutputStream(), problem);
    }
}

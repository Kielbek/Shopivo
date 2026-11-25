package pl.shopivo.authentication.internal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.MDC;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import pl.shopivo.shared.security.CurrentUser;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserCredentials;
import pl.shopivo.users.UserStatus;

/**
 * Authenticates requests carrying the session cookie and binds the user to {@link TenantContext} (used by RLS).
 * A session whose user requires MFA but has not completed it only gets {@code ROLE_MFA_PENDING}.
 */
class SessionAuthenticationFilter extends OncePerRequestFilter {

    private final SessionService sessions;
    private final SessionCookies cookies;
    private final UserAccounts users;
    private final boolean requirePlatformStaffMfa;

    SessionAuthenticationFilter(SessionService sessions, SessionCookies cookies, UserAccounts users,
            boolean requirePlatformStaffMfa) {
        this.sessions = sessions;
        this.cookies = cookies;
        this.users = users;
        this.requirePlatformStaffMfa = requirePlatformStaffMfa;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            authenticate(request);
            chain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            MDC.remove("userId");
        }
    }

    private void authenticate(HttpServletRequest request) {
        Optional<String> token = cookies.read(request);
        if (token.isEmpty()) {
            return;
        }
        sessions.resolve(token.get()).ifPresent(session -> {
            UserCredentials user = users.credentialsById(session.userId());
            if (user.status() != UserStatus.ACTIVE) {
                return;
            }
            boolean mfaPending = user.mfaEnabled() && !session.mfaVerified();
            // Platform staff privileges are granted only to accounts protected by a second factor.
            String platformRole = user.platformRole() == null || (requirePlatformStaffMfa && !user.mfaEnabled())
                    ? null : user.platformRole().name();
            CurrentUser principal = new CurrentUser(user.id(), user.email(), platformRole, session.id(), mfaPending);
            List<GrantedAuthority> authorities = new ArrayList<>();
            if (mfaPending) {
                authorities.add(new SimpleGrantedAuthority("ROLE_MFA_PENDING"));
            } else {
                authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
                if (principal.platformRole() != null) {
                    authorities.add(new SimpleGrantedAuthority("ROLE_" + principal.platformRole()));
                }
            }
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, authorities));
            SecurityContextHolder.setContext(context);
            TenantContext.bindUser(user.id());
            MDC.put("userId", user.id().toString());
        });
    }
}

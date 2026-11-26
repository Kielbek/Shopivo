package pl.shopivo.authentication.internal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;
import pl.shopivo.shared.error.RateLimitedException;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.security.SecurityUtils;

/**
 * Per-user limit for the authenticated panel API (300 requests / minute, docs/API_DESIGN.md §8). Protects the
 * database from a scripted or runaway client using a valid session. Fails open when Redis is unavailable.
 */
class UserRateLimitFilter extends OncePerRequestFilter {

    static final int LIMIT = 300;

    private final RateLimiter rateLimiter;
    private final ProblemResponseWriter problems;

    UserRateLimitFilter(RateLimiter rateLimiter, ProblemResponseWriter problems) {
        this.rateLimiter = rateLimiter;
        this.problems = problems;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return !uri.startsWith("/api/") || uri.startsWith("/api/v1/storefront/") || uri.startsWith("/api/v1/webhooks/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var user = SecurityUtils.currentUser();
        if (user.isPresent()) {
            try {
                rateLimiter.consume("api:user:" + user.get().id(), LIMIT, Duration.ofMinutes(1));
            } catch (RateLimitedException e) {
                response.setHeader("Retry-After", String.valueOf(Math.max(1, e.retryAfter().toSeconds())));
                problems.write(response, HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Zbyt wiele żądań. Spróbuj ponownie za chwilę.");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}

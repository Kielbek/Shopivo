package pl.shopivo.authentication.internal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import pl.shopivo.shared.config.ShopivoProperties;

/**
 * Invalidates the CSRF token when the authentication state changes (login, MFA step, logout). The SPA reacts to the
 * resulting {@code CSRF_INVALID} / missing token by fetching a fresh one from {@code GET /api/v1/auth/csrf}.
 */
@Component
public class CsrfTokenRotation {

    private final CookieCsrfTokenRepository repository;

    CsrfTokenRotation(ShopivoProperties properties) {
        this.repository = SecurityConfiguration.csrfTokenRepository(properties.security().cookieSecure());
    }

    public void rotate(HttpServletRequest request, HttpServletResponse response) {
        repository.saveToken(null, request, response);
    }
}

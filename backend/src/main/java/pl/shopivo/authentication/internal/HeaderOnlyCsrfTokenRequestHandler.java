package pl.shopivo.authentication.internal;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

/**
 * Accepts the CSRF token only from the request header — never from a form parameter. A cross-site (or same-site
 * sibling subdomain) page can submit an HTML form with a {@code _csrf} field, but it cannot set a custom header
 * without a CORS preflight, which this API never grants.
 */
class HeaderOnlyCsrfTokenRequestHandler extends CsrfTokenRequestAttributeHandler {

    @Override
    public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
        return request.getHeader(csrfToken.getHeaderName());
    }
}

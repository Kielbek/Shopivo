package pl.shopivo.authentication.internal;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.config.ShopivoProperties;

/**
 * Writes the session cookie. With HTTPS the {@code __Host-} prefix guarantees Secure, Path=/ and no Domain
 * attribute (cookie cannot be set or read by sibling subdomains such as merchant storefronts).
 */
@Component
public class SessionCookies {

    private final boolean secure;
    private final String name;

    SessionCookies(ShopivoProperties properties) {
        this.secure = properties.security().cookieSecure();
        this.name = secure ? "__Host-shopivo_session" : "shopivo_session";
    }

    public String name() {
        return name;
    }

    public Optional<String> read(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        for (Cookie c : cookies) {
            if (name.equals(c.getName())) {
                return Optional.ofNullable(c.getValue());
            }
        }
        return Optional.empty();
    }

    public void write(HttpServletResponse response, SessionService.IssuedSession session) {
        ResponseCookie.ResponseCookieBuilder builder = base(session.token());
        if (session.rememberMe()) {
            builder.maxAge(Duration.between(Instant.now(), session.absoluteExpiresAt()));
        }
        response.addHeader(HttpHeaders.SET_COOKIE, builder.build().toString());
    }

    public void clear(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, base("").maxAge(0).build().toString());
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(name, value).httpOnly(true).secure(secure).sameSite("Lax").path("/");
    }
}

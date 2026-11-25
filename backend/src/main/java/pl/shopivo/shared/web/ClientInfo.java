package pl.shopivo.shared.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Client metadata of the current HTTP request. The remote address is already resolved from trusted
 * proxies by Tomcat's RemoteIpValve ({@code server.tomcat.remoteip.internal-proxies}).
 */
public record ClientInfo(String ipAddress, String userAgent) {

    private static final int MAX_USER_AGENT = 512;
    private static final ClientInfo UNKNOWN = new ClientInfo(null, null);

    public static ClientInfo current() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            return from(attrs.getRequest());
        }
        return UNKNOWN;
    }

    public static ClientInfo from(HttpServletRequest request) {
        String ua = request.getHeader("User-Agent");
        if (ua != null && ua.length() > MAX_USER_AGENT) {
            ua = ua.substring(0, MAX_USER_AGENT);
        }
        return new ClientInfo(request.getRemoteAddr(), ua);
    }
}

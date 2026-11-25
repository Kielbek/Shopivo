package pl.shopivo.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import jakarta.servlet.http.Cookie;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A browser-like client for MockMvc: keeps cookies between requests and performs the SPA CSRF handshake
 * (XSRF-TOKEN cookie → X-XSRF-TOKEN header) exactly like the Angular frontend.
 */
public class ApiClient {

    private final MockMvc mvc;
    private final JsonMapper json;
    private final Map<String, String> cookies = new LinkedHashMap<>();
    private String remoteAddr = "203.0.113.10";

    public ApiClient(MockMvc mvc, JsonMapper json) {
        this.mvc = mvc;
        this.json = json;
    }

    public record Response(int status, String body, JsonNode json, MockHttpServletResponse raw) {

        public String code() {
            return json != null && json.has("code") ? json.get("code").asString() : null;
        }
    }

    public ApiClient fromIp(String ip) {
        this.remoteAddr = ip;
        return this;
    }

    public Response get(String path) {
        return exchange(HttpMethod.GET, path, null);
    }

    public Response post(String path, Object body) {
        return exchange(HttpMethod.POST, path, body);
    }

    public Response put(String path, Object body) {
        return exchange(HttpMethod.PUT, path, body);
    }

    public Response patch(String path, Object body) {
        return exchange(HttpMethod.PATCH, path, body);
    }

    public Response delete(String path) {
        return exchange(HttpMethod.DELETE, path, null);
    }

    /** Sends a state-changing request without the CSRF header (to verify protection). */
    public Response postWithoutCsrf(String path, Object body) {
        return send(HttpMethod.POST, path, body, false);
    }

    public String cookie(String name) {
        return cookies.get(name);
    }

    public void dropCookie(String name) {
        cookies.remove(name);
    }

    public void setCookie(String name, String value) {
        cookies.put(name, value);
    }

    private Response exchange(HttpMethod method, String path, Object body) {
        boolean unsafe = method != HttpMethod.GET && method != HttpMethod.HEAD;
        if (unsafe && !cookies.containsKey("XSRF-TOKEN")) {
            send(HttpMethod.GET, "/api/v1/auth/csrf", null, false);
        }
        return send(method, path, body, unsafe);
    }

    private Response send(HttpMethod method, String path, Object body, boolean withCsrf) {
        try {
            MockHttpServletRequestBuilder builder = request(method, path)
                    .accept(MediaType.APPLICATION_JSON)
                    .with(r -> {
                        r.setRemoteAddr(remoteAddr);
                        return r;
                    });
            if (!cookies.isEmpty()) {
                builder.cookie(cookies.entrySet().stream().map(e -> new Cookie(e.getKey(), e.getValue()))
                        .toArray(Cookie[]::new));
            }
            if (withCsrf && cookies.containsKey("XSRF-TOKEN")) {
                builder.header("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
            }
            if (body != null) {
                builder.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
            }
            MockHttpServletResponse response = mvc.perform(builder).andReturn().getResponse();
            for (Cookie c : response.getCookies()) {
                if (c.getMaxAge() == 0 || c.getValue() == null || c.getValue().isEmpty()) {
                    cookies.remove(c.getName());
                } else {
                    cookies.put(c.getName(), c.getValue());
                }
            }
            String content = response.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
            JsonNode node = content.isBlank() ? null : tryParse(content);
            return new Response(response.getStatus(), content, node, response);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private JsonNode tryParse(String content) {
        try {
            return json.readTree(content);
        } catch (RuntimeException e) {
            return null;
        }
    }
}

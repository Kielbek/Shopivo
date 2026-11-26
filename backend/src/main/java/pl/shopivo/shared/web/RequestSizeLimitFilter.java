package pl.shopivo.shared.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Caps request bodies of the JSON API (1 MB; operator webhooks 64 KB). Tomcat limits only form posts, so without
 * this an anonymous client could stream an arbitrarily large body into a public endpoint (checkout, webhooks).
 * Declared lengths are rejected up front (413); chunked bodies are cut off while reading.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RequestSizeLimitFilter extends OncePerRequestFilter {

    static final long DEFAULT_LIMIT = 1024 * 1024;
    static final long WEBHOOK_LIMIT = 64 * 1024;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long limit = request.getRequestURI().startsWith("/api/v1/webhooks/") ? WEBHOOK_LIMIT : DEFAULT_LIMIT;
        if (request.getContentLengthLong() > limit) {
            response.setStatus(413);
            response.setContentType("application/problem+json");
            response.setCharacterEncoding("UTF-8");
            response.getOutputStream().write(("{\"type\":\"about:blank\",\"title\":\"Payload Too Large\",\"status\":413,"
                    + "\"detail\":\"Przesłane dane są za duże.\",\"code\":\"PAYLOAD_TOO_LARGE\"}").getBytes(StandardCharsets.UTF_8));
            return;
        }
        chain.doFilter(new Limited(request, limit), response);
    }

    private static final class Limited extends HttpServletRequestWrapper {
        private final long limit;
        private ServletInputStream stream;

        Limited(HttpServletRequest request, long limit) {
            super(request);
            this.limit = limit;
        }

        @Override
        public java.io.BufferedReader getReader() throws IOException {
            String encoding = getCharacterEncoding() == null ? "UTF-8" : getCharacterEncoding();
            return new java.io.BufferedReader(new java.io.InputStreamReader(getInputStream(), encoding));
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (stream == null) {
                ServletInputStream delegate = super.getInputStream();
                stream = new ServletInputStream() {
                    private long read;

                    @Override
                    public int read() throws IOException {
                        int b = delegate.read();
                        if (b >= 0) count(1);
                        return b;
                    }

                    @Override
                    public int read(byte[] buf, int off, int len) throws IOException {
                        int n = delegate.read(buf, off, len);
                        if (n > 0) count(n);
                        return n;
                    }

                    private void count(long n) throws IOException {
                        read += n;
                        if (read > limit) throw new IOException("Request body exceeds " + limit + " bytes");
                    }

                    @Override
                    public boolean isFinished() {
                        return delegate.isFinished();
                    }

                    @Override
                    public boolean isReady() {
                        return delegate.isReady();
                    }

                    @Override
                    public void setReadListener(ReadListener listener) {
                        delegate.setReadListener(listener);
                    }
                };
            }
            return stream;
        }
    }
}

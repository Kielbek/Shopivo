package pl.shopivo.shared.captcha;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

/** Local stand-in for Cloudflare's siteverify endpoint: token "ok" passes, anything else fails. */
public final class FakeTurnstile implements AutoCloseable {

    private final HttpServer server;
    public final AtomicReference<String> lastRemoteIp = new AtomicReference<>();
    public volatile String forcedBody;

    public FakeTurnstile() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/siteverify", exchange -> {
            String form = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            String response = null;
            for (String part : form.split("&")) {
                String[] kv = part.split("=", 2);
                if (kv.length == 2 && kv[0].equals("response")) response = URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
                if (kv.length == 2 && kv[0].equals("remoteip")) lastRemoteIp.set(URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
            }
            String body = forcedBody != null ? forcedBody
                    : "ok".equals(response) ? "{\"success\":true}" : "{\"success\":false,\"error-codes\":[\"invalid-input-response\"]}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
    }

    public String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/siteverify";
    }

    @Override
    public void close() {
        server.stop(0);
    }
}

package pl.shopivo.support;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Local stand-in for Google's OAuth token endpoint: answers an authorization code with an ID token whose claims the test
 * sets ({@link #next}). Records every request (form fields) for assertions.
 */
public final class FakeGoogle {

    public final List<Map<String, String>> calls = new CopyOnWriteArrayList<>();
    /** Claims (JSON object text) of the next ID token; null = Google answers invalid_grant. */
    public volatile String next;
    private final HttpServer server;

    public FakeGoogle() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/token", this::handle);
        server.start();
    }

    public String tokenUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/token";
    }

    private void handle(HttpExchange ex) throws IOException {
        Map<String, String> form = new LinkedHashMap<>();
        for (String part : new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8).split("&")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2) form.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8), URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
        }
        calls.add(form);
        String claims = next;
        int status = claims == null ? 400 : 200;
        String body;
        if (claims == null) {
            body = "{\"error\":\"invalid_grant\"}";
        } else {
            Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
            String jwt = b64.encodeToString("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8)) + "."
                    + b64.encodeToString(claims.getBytes(StandardCharsets.UTF_8)) + ".c2lnbmF0dXJl";
            body = "{\"access_token\":\"ya29.fake\",\"expires_in\":3599,\"token_type\":\"Bearer\",\"id_token\":\"" + jwt + "\"}";
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }
}

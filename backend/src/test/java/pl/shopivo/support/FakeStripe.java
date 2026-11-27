package pl.shopivo.support;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Local stand-in for the parts of the Stripe API Shopivo uses (accounts, account links, checkout sessions), answering
 * with the documented response shapes. Records every request for assertions.
 */
public final class FakeStripe implements AutoCloseable {

    public static final String SECRET_KEY = "sk_test_shopivo_fake";
    public static final String WEBHOOK_SECRET = "whsec_shopivo_fake";

    public record Call(String method, String path, Map<String, String> form, String stripeAccount, String authorization, String version) {
    }

    private final HttpServer server;
    private final AtomicInteger seq = new AtomicInteger();
    public final List<Call> calls = new CopyOnWriteArrayList<>();
    /** Accounts Stripe has finished verifying (charges_enabled = true). */
    public final Set<String> chargesEnabled = ConcurrentHashMap.newKeySet();

    public FakeStripe() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/", this::handle);
        server.start();
    }

    public String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public List<Call> calls(String path) {
        return calls.stream().filter(c -> c.path().equals(path)).toList();
    }

    private void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Map<String, String> form = new LinkedHashMap<>();
        for (String part : body.split("&")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2) form.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8), URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
        }
        var h = ex.getRequestHeaders();
        calls.add(new Call(ex.getRequestMethod(), path, form, h.getFirst("Stripe-Account"), h.getFirst("Authorization"), h.getFirst("Stripe-Version")));
        int status = 200;
        String response;
        if (!("Basic " + java.util.Base64.getEncoder().encodeToString((SECRET_KEY + ":").getBytes(StandardCharsets.UTF_8))).equals(h.getFirst("Authorization"))) {
            status = 401;
            response = "{\"error\":{\"message\":\"Invalid API Key provided\"}}";
        } else if (path.equals("/v1/accounts") && ex.getRequestMethod().equals("POST")) {
            response = "{\"id\":\"acct_test" + seq.incrementAndGet() + "\",\"object\":\"account\",\"charges_enabled\":false}";
        } else if (path.equals("/v1/account_links")) {
            response = "{\"object\":\"account_link\",\"url\":\"https://connect.stripe.com/setup/c/" + form.get("account") + "/x" + seq.incrementAndGet() + "\"}";
        } else if (path.startsWith("/v1/accounts/")) {
            String id = path.substring("/v1/accounts/".length());
            boolean on = chargesEnabled.contains(id);
            response = "{\"id\":\"" + id + "\",\"charges_enabled\":" + on + ",\"payouts_enabled\":" + on + ",\"details_submitted\":" + on
                    + ",\"requirements\":{\"currently_due\":" + (on ? "[]" : "[\"external_account\"]") + ",\"past_due\":[],\"disabled_reason\":"
                    + (on ? "null" : "\"requirements.past_due\"") + "}}";
        } else if (path.equals("/v1/checkout/sessions")) {
            if (h.getFirst("Stripe-Account") == null) {
                status = 400;
                response = "{\"error\":{\"message\":\"Missing Stripe-Account\"}}";
            } else {
                String id = "cs_test_" + seq.incrementAndGet();
                response = "{\"id\":\"" + id + "\",\"object\":\"checkout.session\",\"url\":\"https://checkout.stripe.com/c/pay/" + id + "\"}";
            }
        } else {
            status = 404;
            response = "{\"error\":{\"message\":\"Unrecognized request URL\"}}";
        }
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }

    @Override
    public void close() {
        server.stop(0);
    }
}

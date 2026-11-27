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
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Local stand-ins for Apaczka Web API v2 (signed form envelope, HTTP 200 + status in body) and Furgonetka REST
 * (OAuth2 token endpoint, bearer API), answering with the documented shapes. Records requests for assertions.
 */
public final class FakeCouriers implements AutoCloseable {

    public static final String APACZKA_APP_ID = "app-shopivo-1";
    public static final String APACZKA_SECRET = "apaczka-secret-1";
    public static final String FURGONETKA_CLIENT_ID = "shopivo-client";
    public static final String FURGONETKA_CLIENT_SECRET = "shopivo-client-secret";
    public static final String PDF = "%PDF-1.4 fake label";

    public record Call(String path, String body, Map<String, String> form, String authorization) {
    }

    private final HttpServer server;
    private final AtomicInteger seq = new AtomicInteger(1000);
    public final List<Call> calls = new CopyOnWriteArrayList<>();
    public volatile String furgonetkaAccessToken = "furg-access-1";

    public FakeCouriers() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/apaczka/api/v2/", this::apaczka);
        server.createContext("/furgonetka/", this::furgonetka);
        server.start();
    }

    public String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public List<Call> calls(String path) {
        return calls.stream().filter(c -> c.path().equals(path)).toList();
    }

    // ------------------------------------------------------------------ Apaczka

    private void apaczka(HttpExchange ex) throws IOException {
        String route = ex.getRequestURI().getPath().substring("/apaczka/api/v2/".length());
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Map<String, String> form = form(body);
        calls.add(new Call("apaczka:" + route, body, form, null));
        String expected = hmac(APACZKA_SECRET, form.get("app_id") + ":" + route + ":" + form.get("request") + ":" + form.get("expires"));
        if (!APACZKA_APP_ID.equals(form.get("app_id")) || !expected.equals(form.get("signature"))) {
            send(ex, 200, "{\"status\":400,\"message\":\"Invalid signature\",\"response\":null}");
            return;
        }
        String response;
        if (route.equals("service_structure/")) {
            response = "{\"services\":[{\"service_id\":\"21\",\"name\":\"DPD Classic\",\"supplier\":\"DPD\",\"domestic\":1,\"pickup_courier\":1,"
                    + "\"door_to_door\":1,\"door_to_point\":0,\"point_to_point\":0,\"point_to_door\":0},"
                    + "{\"service_id\":\"41\",\"name\":\"InPost Paczkomaty\",\"supplier\":\"INPOST\",\"domestic\":1,\"pickup_courier\":0,"
                    + "\"door_to_door\":0,\"door_to_point\":1,\"point_to_point\":1,\"point_to_door\":0}]}";
        } else if (route.equals("order_send/")) {
            int id = seq.incrementAndGet();
            response = "{\"order\":{\"id\":" + id + ",\"service_id\":21,\"waybill_number\":\"WB" + id + "\",\"status\":\"NEW\","
                    + "\"tracking_url\":\"https://www.apaczka.pl/sledzenie-przesylek/?numer=WB" + id + "\"}}";
        } else if (route.startsWith("order/")) {
            String id = route.split("/")[1];
            response = "{\"order\":{\"id\":" + id + ",\"waybill_number\":\"WB" + id + "\",\"status\":\"NEW\"}}";
        } else if (route.startsWith("waybill/")) {
            response = "{\"waybill\":\"" + Base64.getEncoder().encodeToString(PDF.getBytes(StandardCharsets.UTF_8)) + "\",\"type\":\"pdf\"}";
        } else if (route.startsWith("tracking/")) {
            response = "{\"data\":[{\"status\":\"DELIVERED\",\"status_original\":\"Doreczona\",\"description\":\"Przesylka doreczona\","
                    + "\"place\":\"Warszawa\",\"updated_at\":\"2026-11-27T10:00:00+00:00\"},{\"status\":\"PICKUP\",\"description\":\"Nadana\"}],\"service\":\"DPD\"}";
        } else if (route.equals("points/INPOST/")) {
            response = "{\"points\":{\"1\":{\"type\":\"INPOST\",\"subtype\":\"parcel_locker\",\"name\":\"WAW01M\",\"foreign_address_id\":\"WAW01M\","
                    + "\"address\":{\"line1\":\"Marszalkowska 1\",\"postal_code\":\"00-624\",\"city\":\"Warszawa\",\"country_code\":\"PL\"},"
                    + "\"option_cod\":true,\"option_send\":true,\"option_deliver\":true}}}";
        } else {
            send(ex, 200, "{\"status\":404,\"message\":\"Unknown route\",\"response\":null}");
            return;
        }
        send(ex, 200, "{\"status\":200,\"message\":\"\",\"response\":" + response + "}");
    }

    // ------------------------------------------------------------------ Furgonetka

    private void furgonetka(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath().substring("/furgonetka".length());
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String auth = ex.getRequestHeaders().getFirst("Authorization");
        calls.add(new Call("furgonetka:" + ex.getRequestMethod() + " " + path, body, form(body), auth));
        if (path.equals("/oauth/token")) {
            String basic = "Basic " + Base64.getEncoder().encodeToString((FURGONETKA_CLIENT_ID + ":" + FURGONETKA_CLIENT_SECRET).getBytes(StandardCharsets.UTF_8));
            Map<String, String> f = form(body);
            if (!basic.equals(auth) || !("good-code".equals(f.get("code")) || f.get("refresh_token") != null)) {
                send(ex, 400, "{\"error\":\"invalid_grant\",\"error_description\":\"Kod autoryzacyjny jest nieprawidłowy.\"}");
                return;
            }
            send(ex, 200, "{\"token_type\":\"Bearer\",\"expires_in\":2678400,\"access_token\":\"" + furgonetkaAccessToken
                    + "\",\"refresh_token\":\"def-refresh\"}");
            return;
        }
        if (!("Bearer " + furgonetkaAccessToken).equals(auth)) {
            send(ex, 401, "{\"code\":401,\"message\":\"Invalid token\"}");
            return;
        }
        if (path.equals("/account/services")) {
            send(ex, 200, "{\"services\":[{\"id\":7001,\"service\":\"inpost\",\"name\":\"InPost Paczkomaty\",\"owner\":\"furgonetka\"},"
                    + "{\"id\":7002,\"service\":\"gls\",\"name\":\"GLS\",\"owner\":\"furgonetka\"}]}");
        } else if (path.equals("/packages") && ex.getRequestMethod().equals("POST")) {
            send(ex, 200, "{\"package_id\":\"" + seq.incrementAndGet() + "\"}");
        } else if (path.startsWith("/order-commands/")) {
            send(ex, 200, "{\"uuid\":\"" + path.substring("/order-commands/".length()) + "\"}");
        } else if (path.matches("/packages/\\d+/label")) {
            byte[] pdf = PDF.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/pdf");
            ex.sendResponseHeaders(200, pdf.length);
            ex.getResponseBody().write(pdf);
            ex.close();
        } else if (path.matches("/packages/\\d+/tracking")) {
            send(ex, 200, "{\"tracking\":[{\"state\":\"transit\",\"status\":\"W drodze\",\"datetime\":\"2026-11-26T10:00:00+01:00\"},"
                    + "{\"state\":\"delivered\",\"status\":\"Doręczona\",\"datetime\":\"2026-11-27T09:00:00+01:00\"}]}");
        } else if (path.matches("/packages/\\d+")) {
            String id = path.substring("/packages/".length());
            send(ex, 200, "{\"package_id\":\"" + id + "\",\"state\":\"ordered\",\"parcels\":[{\"package_no\":\"FG" + id + "\"}]}");
        } else if (path.equals("/points/map")) {
            send(ex, 200, "{\"points\":[{\"point_id\":\"KRA01M\",\"code\":\"KRA01M\",\"name\":\"Paczkomat KRA01M\",\"active\":true,"
                    + "\"is_delivery_point\":true,\"service\":\"inpost\",\"address\":{\"street\":\"Floriańska 1\",\"postcode\":\"31-019\",\"city\":\"Kraków\"}}]}");
        } else {
            send(ex, 404, "{\"errors\":[{\"path\":\"\",\"message\":\"Not found\"}]}");
        }
    }

    // ------------------------------------------------------------------ helpers

    private static Map<String, String> form(String body) {
        Map<String, String> form = new LinkedHashMap<>();
        for (String part : body.split("&")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2) form.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8), URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
        }
        return form;
    }

    static String hmac(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return java.util.HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void send(HttpExchange ex, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
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

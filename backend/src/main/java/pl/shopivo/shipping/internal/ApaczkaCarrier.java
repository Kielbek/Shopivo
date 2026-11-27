package pl.shopivo.shipping.internal;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import pl.shopivo.orders.OrderModel.ShippingType;
import pl.shopivo.shipping.CarrierAdapter;
import pl.shopivo.shipping.CarrierModels.CarrierContext;
import pl.shopivo.shipping.CarrierModels.CarrierDescriptor;
import pl.shopivo.shipping.CarrierModels.CarrierException;
import pl.shopivo.shipping.CarrierModels.CarrierService;
import pl.shopivo.shipping.CarrierModels.CarrierShipment;
import pl.shopivo.shipping.CarrierModels.CredentialField;
import pl.shopivo.shipping.CarrierModels.Point;
import pl.shopivo.shipping.CarrierModels.ShipmentRequest;
import pl.shopivo.shipping.CarrierModels.ShipmentStatus;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Apaczka.pl Web API v2 (api-docs.apaczka.pl): every call is a form POST {app_id, request (JSON), expires (≤ now+15 min),
 * signature = hex HMAC-SHA256 of "app_id:route:request:expires" keyed with app_secret}; HTTP is always 200, the real
 * outcome is {@code status} in the body. Flow: service_structure/ → order_send/ → order/{id}/ → waybill/{id}/ (base64 PDF)
 * → tracking/{waybill}/; points via points/{TYPE}/. Tested on a local stand-in — verify on panel-sandbox.apaczka.pl.
 */
@Component
class ApaczkaCarrier implements CarrierAdapter {

    static final String ID = "apaczka";
    private static final CarrierDescriptor DESCRIPTOR = new CarrierDescriptor(ID, "Apaczka",
            "Ponad 20 przewoźników przez jedno konto: InPost, DPD, DHL, GLS, UPS, Poczta Polska, ORLEN Paczka, FedEx…",
            List.of(new CredentialField("appId", "App ID", false, "Panel Apaczki → Ustawienia → API"),
                    new CredentialField("appSecret", "App Secret", true, "Panel Apaczki → Ustawienia → API")),
            List.of(ShippingType.COURIER, ShippingType.PARCEL_LOCKER), "https://api-docs.apaczka.pl", true, false, true);

    private final RestClient http;
    private final JsonMapper json;
    private final String apiUrl;
    private final String sandboxApiUrl;
    private final Clock clock;
    /** Point lists are large and change slowly (points/{type}/ has no search) — cached per environment and type. */
    private final Cache<String, List<Point>> points = Caffeine.newBuilder().maximumSize(40).expireAfterWrite(Duration.ofHours(6)).build();

    @org.springframework.beans.factory.annotation.Autowired
    ApaczkaCarrier(JsonMapper json, @Value("${shopivo.apaczka.api-url:https://www.apaczka.pl/api/v2/}") String apiUrl,
            @Value("${shopivo.apaczka.sandbox-api-url:https://panel-sandbox.apaczka.pl/api/v2/}") String sandboxApiUrl) {
        this(json, apiUrl, sandboxApiUrl, Clock.systemUTC());
    }

    ApaczkaCarrier(JsonMapper json, String apiUrl, String sandboxApiUrl, Clock clock) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(30));
        this.http = RestClient.builder().requestFactory(factory).defaultHeader("User-Agent", "Shopivo/1.0").build();
        this.json = json;
        this.apiUrl = apiUrl.endsWith("/") ? apiUrl : apiUrl + "/";
        this.sandboxApiUrl = sandboxApiUrl.endsWith("/") ? sandboxApiUrl : sandboxApiUrl + "/";
        this.clock = clock;
    }

    @Override
    public CarrierDescriptor descriptor() {
        return DESCRIPTOR;
    }

    @Override
    public void testConnection(CarrierContext ctx) {
        services(ctx);
    }

    @Override
    public List<CarrierService> services(CarrierContext ctx) {
        JsonNode r = call(ctx, "service_structure/", Map.of());
        List<CarrierService> out = new ArrayList<>();
        for (JsonNode s : iterable(r.path("services"))) {
            String id = s.path("service_id").asString(s.path("id").asString(""));
            if (id.isBlank()) continue;
            String supplier = s.path("supplier").asString("").toLowerCase(Locale.ROOT);
            List<ShippingType> types = new ArrayList<>();
            if (flag(s, "door_to_door") || flag(s, "point_to_door") || !s.has("door_to_door")) types.add(ShippingType.COURIER);
            if (flag(s, "door_to_point") || flag(s, "point_to_point")) types.add(ShippingType.PARCEL_LOCKER);
            out.add(new CarrierService(id, s.path("name").asString(supplier), courierCode(supplier), List.copyOf(types)));
        }
        return out;
    }

    @Override
    public CarrierShipment createShipment(CarrierContext ctx, ShipmentRequest r) {
        if (r.service() == null) throw new CarrierException("Wybierz usługę kurierską.");
        if (r.sender() == null || r.sender().line1() == null) {
            throw new CarrierException("Uzupełnij adres firmy w Ustawieniach → Dane firmy — to adres nadawcy na etykiecie.");
        }
        Map<String, Object> sender = address(r.sender().company() != null ? r.sender().company() : r.sender().name(), r.sender().name(),
                r.sender().email(), r.sender().phone(), r.sender().line1(), r.sender().postalCode(), r.sender().city(), r.sender().countryCode());
        Map<String, Object> receiver = address(r.recipient().company() != null ? r.recipient().company() : r.recipient().name(), r.recipient().name(),
                r.recipient().email(), r.recipient().phone(), r.recipient().line1(), r.recipient().postalCode(), r.recipient().city(),
                r.recipient().countryCode());
        if (r.type() == ShippingType.PARCEL_LOCKER) receiver.put("foreign_address_id", r.pointCode());
        Map<String, Object> parcel = new LinkedHashMap<>();
        if (r.parcel().weightGrams() != null) {
            parcel.put("dimension1", cm(r.parcel().lengthMm()));
            parcel.put("dimension2", cm(r.parcel().widthMm()));
            parcel.put("dimension3", cm(r.parcel().heightMm()));
            parcel.put("weight", r.parcel().weightGrams() / 1000.0);
        } else {
            int[] d = switch (r.parcel().template() == null ? "small" : r.parcel().template()) {
                case "large" -> new int[] {64, 38, 41};
                case "medium" -> new int[] {64, 38, 19};
                default -> new int[] {64, 38, 8};
            };
            parcel.put("dimension1", d[0]);
            parcel.put("dimension2", d[1]);
            parcel.put("dimension3", d[2]);
            parcel.put("weight", 5.0);
        }
        parcel.put("is_nstd", 0);
        Map<String, Object> order = new LinkedHashMap<>();
        order.put("service_id", Long.parseLong(r.service()));
        order.put("address", Map.of("sender", sender, "receiver", receiver));
        order.put("pickup", Map.of("type", "SELF"));
        order.put("shipment", List.of(parcel));
        order.put("content", r.reference() == null ? "Zamówienie" : r.reference());
        if (r.codMinor() != null) order.put("cod", Map.of("amount", r.codMinor(), "currency", r.currency() == null ? "PLN" : r.currency()));
        JsonNode o = call(ctx, "order_send/", Map.of("order", order)).path("order");
        return state(o);
    }

    @Override
    public CarrierShipment shipment(CarrierContext ctx, String externalId) {
        return state(call(ctx, "order/" + safe(externalId) + "/", Map.of()).path("order"));
    }

    private static CarrierShipment state(JsonNode o) {
        String id = o.path("id").asString(null);
        if (id == null || id.isBlank()) throw new CarrierException("Apaczka nie zwróciła numeru zamówienia.");
        String waybill = o.path("waybill_number").asString(null);
        String status = o.path("status").asString("NEW");
        return new CarrierShipment(id, waybill == null || waybill.isBlank() ? null : waybill, status, map(status));
    }

    @Override
    public byte[] label(CarrierContext ctx, String externalId) {
        String b64 = call(ctx, "waybill/" + safe(externalId) + "/", Map.of()).path("waybill").asString("");
        if (b64.isBlank()) throw new CarrierException("Etykieta nie jest jeszcze dostępna.");
        return Base64.getMimeDecoder().decode(b64);
    }

    @Override
    public CarrierShipment track(CarrierContext ctx, String trackingNumber) {
        JsonNode data = call(ctx, "tracking/" + safe(trackingNumber) + "/", Map.of()).path("data");
        if (data.isEmpty()) return new CarrierShipment(null, trackingNumber, null, ShipmentStatus.READY);
        JsonNode latest = data.get(0); // events are returned newest first
        String status = latest.path("status").asString("UNKNOWN");
        return new CarrierShipment(null, trackingNumber, truncate(latest.path("description").asString(status), 60), map(status));
    }

    @Override
    public CarrierShipment track(CarrierContext ctx, String externalId, String trackingNumber) {
        CarrierShipment t = track(ctx, trackingNumber);
        return new CarrierShipment(externalId, trackingNumber, t.carrierStatus(), t.status());
    }

    /** Normalized statuses from the Tracking guide (polling vocabulary). */
    static ShipmentStatus map(String status) {
        return switch (status) {
            case "NEW" -> ShipmentStatus.READY;
            case "DELIVERED", "DELIVERED_NO_SYSTEM" -> ShipmentStatus.DELIVERED;
            case "RETURNED_TO_SHIPPER" -> ShipmentStatus.RETURNED;
            case "CANCELLED", "CORRECTION" -> ShipmentStatus.CANCELED;
            case "PICKUP", "IN_TRANSIT", "EXCEPTION" -> ShipmentStatus.IN_TRANSIT;
            default -> ShipmentStatus.READY;
        };
    }

    // ------------------------------------------------------------------ points

    @Override
    public List<Point> searchPoints(CarrierContext ctx, CarrierService service, String query) {
        String q = query.strip().toLowerCase(Locale.ROOT);
        return all(ctx, service).stream()
                .filter(p -> p.code().toLowerCase(Locale.ROOT).contains(q) || (p.address() != null && p.address().toLowerCase(Locale.ROOT).contains(q)))
                .limit(20).toList();
    }

    @Override
    public Optional<Point> point(CarrierContext ctx, CarrierService service, String code) {
        return all(ctx, service).stream().filter(p -> p.code().equalsIgnoreCase(code)).findFirst();
    }

    private List<Point> all(CarrierContext ctx, CarrierService service) {
        if (service == null || service.courier() == null) return List.of();
        String type = service.courier().toUpperCase(Locale.ROOT);
        return points.get(ctx.sandbox() + ":" + type, k -> {
            List<Point> out = new ArrayList<>();
            for (JsonNode p : iterable(call(ctx, "points/" + safe(type) + "/", Map.of("country_code", "PL")).path("points"))) {
                if (p.has("option_deliver") && !p.path("option_deliver").asBoolean()) continue;
                JsonNode a = p.path("address");
                String code = p.path("foreign_address_id").asString(p.path("name").asString(""));
                String address = (a.path("line1").asString("") + ", " + a.path("postal_code").asString("") + " " + a.path("city").asString("")).strip();
                out.add(new Point(code, p.path("name").asString(code), address, p.path("additional_info").asString(null)));
            }
            return out;
        });
    }

    @Override
    public List<Point> searchPoints(boolean sandbox, String query) {
        return List.of();
    }

    @Override
    public Optional<Point> point(boolean sandbox, String code) {
        return Optional.empty();
    }

    @Override
    public String trackingUrl(String trackingNumber) {
        return "https://www.apaczka.pl/sledzenie-przesylek/?numer=" + URLEncoder.encode(trackingNumber, StandardCharsets.UTF_8);
    }

    // ------------------------------------------------------------------ signed envelope

    static String sign(String appId, String route, String request, long expires, String appSecret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return java.util.HexFormat.of().formatHex(mac.doFinal((appId + ":" + route + ":" + request + ":" + expires).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private JsonNode call(CarrierContext ctx, String route, Object payload) {
        String appId = ctx.require("appId");
        String request = json.writeValueAsString(payload);
        long expires = clock.instant().getEpochSecond() + 600;
        String form = "app_id=" + enc(appId) + "&request=" + enc(request) + "&expires=" + expires
                + "&signature=" + sign(appId, route, request, expires, ctx.require("appSecret"));
        String body;
        try {
            body = http.post().uri((ctx.sandbox() ? sandboxApiUrl : apiUrl) + route).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form).retrieve().body(String.class);
        } catch (RestClientException e) {
            throw new CarrierException("Brak połączenia z Apaczką. Spróbuj ponownie za chwilę.");
        }
        JsonNode env;
        try {
            env = json.readTree(body == null ? "" : body);
        } catch (RuntimeException e) {
            throw new CarrierException("Apaczka zwróciła nieczytelną odpowiedź.");
        }
        // HTTP is always 200 — the real outcome is `status` in the body.
        if (env.path("status").asInt(0) != 200) {
            String message = env.path("message").asString("");
            throw new CarrierException("Apaczka: " + (message.isBlank() ? "błąd " + env.path("status").asInt(0) : message));
        }
        return env.path("response");
    }

    // ------------------------------------------------------------------ helpers

    private static Map<String, Object> address(String name, String contact, String email, String phone, String line1, String postal,
            String city, String country) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("name", name == null ? "" : name);
        if (contact != null) a.put("contact_person", contact);
        if (email != null) a.put("email", email);
        if (phone != null) a.put("phone", phone);
        if (line1 != null) a.put("line1", line1);
        if (postal != null) a.put("postal_code", postal);
        if (city != null) a.put("city", city);
        a.put("country_code", country == null ? "PL" : country);
        a.put("is_residential", false);
        return a;
    }

    /** Responses use objects keyed by index as well as arrays for lists ("points":{"1":{…}}). */
    private static Iterable<JsonNode> iterable(JsonNode node) {
        if (node.isArray()) return node;
        List<JsonNode> out = new ArrayList<>();
        node.properties().forEach(e -> out.add(e.getValue()));
        return out;
    }

    private static boolean flag(JsonNode s, String name) {
        JsonNode v = s.path(name);
        return v.asInt(0) == 1 || v.asBoolean(false);
    }

    /** Apaczka supplier names → carrier codes shared with logos and points (INPOST, DPD, DHL, GLS, UPS, POCZTA, ORLEN, FEDEX). */
    static String courierCode(String supplier) {
        String s = supplier.toLowerCase(Locale.ROOT);
        if (s.contains("inpost") || s.contains("paczkomat")) return "inpost";
        if (s.contains("orlen") || s.contains("ruch")) return "orlen";
        if (s.contains("poczta") || s.contains("pocztex")) return "poczta";
        for (String c : List.of("dpd", "dhl", "gls", "ups", "fedex")) if (s.contains(c)) return c;
        return s.isBlank() ? null : s;
    }

    private static int cm(Integer mm) {
        return mm == null ? 1 : Math.max(1, (int) Math.ceil(mm / 10.0));
    }

    private static String safe(String s) {
        if (s == null || !s.matches("[A-Za-z0-9_-]{1,64}")) throw new CarrierException("Nieprawidłowy identyfikator przesyłki.");
        return s;
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}

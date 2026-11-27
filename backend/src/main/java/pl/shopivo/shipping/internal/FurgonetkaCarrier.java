package pl.shopivo.shipping.internal;

import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import pl.shopivo.orders.OrderModel.ShippingType;
import pl.shopivo.shipping.CarrierAdapter;
import pl.shopivo.shipping.CarrierModels.CarrierContext;
import pl.shopivo.shipping.CarrierModels.CarrierDescriptor;
import pl.shopivo.shipping.CarrierModels.CarrierException;
import pl.shopivo.shipping.CarrierModels.CarrierService;
import pl.shopivo.shipping.CarrierModels.CarrierShipment;
import pl.shopivo.shipping.CarrierModels.OAuthTokens;
import pl.shopivo.shipping.CarrierModels.Point;
import pl.shopivo.shipping.CarrierModels.ShipmentRequest;
import pl.shopivo.shipping.CarrierModels.ShipmentStatus;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Furgonetka.pl REST API (furgonetka.pl/api/rest, OpenAPI "Furgonetka.pl API REST") — one account gives InPost, DPD,
 * DHL, GLS, UPS, Poczta Polska, ORLEN Paczka, FedEx… The store signs in with Shopivo's OAuth2 application
 * (authorization code; access token 30 days, single-use refresh token). Flow: GET /account/services → POST /packages →
 * PUT /order-commands/{uuid} → GET /packages/{id} (parcel number) → /label (PDF) and /tracking; points via POST /points/map.
 * Written against the published specification and tested on a local stand-in — verify on the Furgonetka sandbox.
 */
@Component
class FurgonetkaCarrier implements CarrierAdapter {

    static final String ID = "furgonetka";
    static final String MEDIA = "application/vnd.furgonetka.v1+json";
    /** Carriers with parcel lockers / pickup points in /points/map (filters.services enum). */
    static final Set<String> POINT_CARRIERS = Set.of("inpost", "orlen", "poczta", "ups", "dhl", "dpd", "meest", "fedex");

    private final RestClient http;
    private final JsonMapper json;
    private final String apiUrl;
    private final String sandboxApiUrl;
    private final String clientId;
    private final String clientSecret;

    FurgonetkaCarrier(JsonMapper json, @Value("${shopivo.furgonetka.api-url:https://api.furgonetka.pl}") String apiUrl,
            @Value("${shopivo.furgonetka.sandbox-api-url:https://api.sandbox.furgonetka.pl}") String sandboxApiUrl,
            @Value("${shopivo.furgonetka.client-id:}") String clientId, @Value("${shopivo.furgonetka.client-secret:}") String clientSecret) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(25));
        this.http = RestClient.builder().requestFactory(factory).defaultHeader("User-Agent", "Shopivo/1.0").build();
        this.json = json;
        this.apiUrl = apiUrl;
        this.sandboxApiUrl = sandboxApiUrl;
        this.clientId = clientId == null ? "" : clientId.strip();
        this.clientSecret = clientSecret == null ? "" : clientSecret.strip();
    }

    @Override
    public CarrierDescriptor descriptor() {
        return new CarrierDescriptor(ID, "Furgonetka", "Jedno konto, wielu kurierów: InPost, DPD, DHL, GLS, UPS, Poczta Polska, ORLEN Paczka, FedEx. "
                + "Łączysz się logując do Furgonetki — bez kluczy.", List.of(), List.of(ShippingType.COURIER, ShippingType.PARCEL_LOCKER),
                "https://furgonetka.pl/api/rest", true, true, !clientId.isEmpty() && !clientSecret.isEmpty());
    }

    private String base(boolean sandbox) {
        return sandbox ? sandboxApiUrl : apiUrl;
    }

    // ------------------------------------------------------------------ OAuth2 (furgonetka.pl/api/oauth)

    @Override
    public String authorizationUrl(boolean sandbox, String redirectUri, String state) {
        requireApp();
        return base(sandbox) + "/oauth/authorize?response_type=code&client_id=" + enc(clientId) + "&redirect_uri=" + enc(redirectUri)
                + "&state=" + enc(state);
    }

    @Override
    public OAuthTokens exchangeCode(boolean sandbox, String code, String redirectUri) {
        return token(sandbox, "grant_type=authorization_code&code=" + enc(code) + "&redirect_uri=" + enc(redirectUri));
    }

    @Override
    public OAuthTokens refresh(boolean sandbox, String refreshToken) {
        return token(sandbox, "grant_type=refresh_token&refresh_token=" + enc(refreshToken));
    }

    private OAuthTokens token(boolean sandbox, String form) {
        requireApp();
        JsonNode t = call(() -> http.post().uri(base(sandbox) + "/oauth/token")
                .headers(h -> h.setBasicAuth(clientId, clientSecret)).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form).retrieve().body(String.class));
        String access = t.path("access_token").asString("");
        if (access.isEmpty()) throw new CarrierException("Furgonetka nie wydała tokenu dostępu.");
        return new OAuthTokens(access, t.path("refresh_token").asString(null), Instant.now().plusSeconds(t.path("expires_in").asLong(2_678_400)));
    }

    private void requireApp() {
        if (clientId.isEmpty() || clientSecret.isEmpty()) throw new CarrierException("Integracja z Furgonetką nie jest skonfigurowana na platformie.");
    }

    // ------------------------------------------------------------------ account

    @Override
    public void testConnection(CarrierContext ctx) {
        services(ctx);
    }

    @Override
    public List<CarrierService> services(CarrierContext ctx) {
        JsonNode r = get(ctx, "/account/services");
        List<CarrierService> out = new ArrayList<>();
        for (JsonNode s : r.path("services")) {
            String courier = s.path("service").asString("").toLowerCase(Locale.ROOT);
            List<ShippingType> types = POINT_CARRIERS.contains(courier) ? List.of(ShippingType.COURIER, ShippingType.PARCEL_LOCKER)
                    : List.of(ShippingType.COURIER);
            out.add(new CarrierService(s.path("id").asString(), s.path("name").asString(courier), courier, types));
        }
        return out;
    }

    // ------------------------------------------------------------------ shipments

    @Override
    public CarrierShipment createShipment(CarrierContext ctx, ShipmentRequest r) {
        if (r.service() == null) throw new CarrierException("Wybierz usługę kurierską.");
        if (r.sender() == null || r.sender().line1() == null) {
            throw new CarrierException("Uzupełnij adres firmy w Ustawieniach → Dane firmy — to adres nadawcy na etykiecie.");
        }
        boolean point = r.type() == ShippingType.PARCEL_LOCKER;
        Map<String, Object> pickup = new LinkedHashMap<>();
        put(pickup, "name", r.sender().name());
        put(pickup, "company", r.sender().company());
        put(pickup, "street", r.sender().line1());
        put(pickup, "postcode", r.sender().postalCode());
        put(pickup, "city", r.sender().city());
        put(pickup, "country_code", r.sender().countryCode() == null ? "PL" : r.sender().countryCode());
        put(pickup, "email", r.sender().email());
        put(pickup, "phone", r.sender().phone());
        Map<String, Object> receiver = new LinkedHashMap<>();
        put(receiver, "name", r.recipient().name());
        put(receiver, "company", r.recipient().company());
        put(receiver, "email", r.recipient().email());
        put(receiver, "phone", r.recipient().phone());
        put(receiver, "country_code", r.recipient().countryCode() == null ? "PL" : r.recipient().countryCode());
        if (point) {
            put(receiver, "point", r.pointCode());
        } else {
            put(receiver, "street", r.recipient().line1());
            put(receiver, "postcode", r.recipient().postalCode());
            put(receiver, "city", r.recipient().city());
        }
        Map<String, Object> parcel = new LinkedHashMap<>();
        if (r.parcel().weightGrams() != null) {
            parcel.put("weight", r.parcel().weightGrams() / 1000.0);
            parcel.put("depth", cm(r.parcel().lengthMm()));
            parcel.put("width", cm(r.parcel().widthMm()));
            parcel.put("height", cm(r.parcel().heightMm()));
        } else {
            // Locker size templates without measurements: InPost gauges A/B/C as maximum dimensions.
            int[] d = switch (r.parcel().template() == null ? "small" : r.parcel().template()) {
                case "large" -> new int[] {64, 38, 41};
                case "medium" -> new int[] {64, 38, 19};
                default -> new int[] {64, 38, 8};
            };
            parcel.put("weight", 5.0);
            parcel.put("depth", d[0]);
            parcel.put("width", d[1]);
            parcel.put("height", d[2]);
        }
        parcel.put("description", r.reference() == null ? "Zamówienie" : truncate(r.reference(), 30));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pickup", pickup);
        body.put("receiver", receiver);
        body.put("service_id", Long.parseLong(r.service()));
        body.put("type", "package");
        body.put("parcels", List.of(parcel));
        if (r.reference() != null) body.put("user_reference_number", truncate(r.reference(), 30));
        if (r.codMinor() != null) {
            body.put("additional_services", Map.of("cod", Map.of("amount", r.codMinor() / 100.0, "currency", r.currency() == null ? "PLN" : r.currency())));
        }
        JsonNode created = send(ctx, "POST", "/packages", body);
        String packageId = created.path("package_id").asString(null);
        if (packageId == null) throw new CarrierException("Furgonetka nie zwróciła identyfikatora przesyłki.");
        // Order it (asynchronous command identified by our UUID)
        send(ctx, "PUT", "/order-commands/" + UUID.randomUUID(), Map.of("packages", List.of(Map.of("id", packageId)),
                "label", Map.of("file_format", "pdf", "page_format", "a6")));
        return shipment(ctx, packageId);
    }

    @Override
    public CarrierShipment shipment(CarrierContext ctx, String externalId) {
        JsonNode p = get(ctx, "/packages/" + enc(externalId));
        String state = p.path("state").asString("waiting");
        String number = null;
        for (JsonNode parcel : p.path("parcels")) {
            String n = parcel.path("package_no").asString(null);
            if (n != null && !n.isBlank()) {
                number = n;
                break;
            }
        }
        ShipmentStatus status = switch (state) {
            case "waiting", "queued" -> ShipmentStatus.PENDING;
            case "cancelled" -> ShipmentStatus.CANCELED;
            case "tracking" -> ShipmentStatus.IN_TRANSIT;
            default -> ShipmentStatus.READY;
        };
        return new CarrierShipment(p.path("package_id").asString(externalId), number, state, status);
    }

    @Override
    public byte[] label(CarrierContext ctx, String externalId) {
        try {
            return http.get().uri(base(ctx.sandbox()) + "/packages/" + enc(externalId) + "/label")
                    .headers(h -> h.setBearerAuth(ctx.require("accessToken"))).accept(MediaType.APPLICATION_PDF)
                    .retrieve().body(byte[].class);
        } catch (RestClientResponseException e) {
            throw new CarrierException(error(e));
        } catch (RestClientException e) {
            throw new CarrierException("Brak połączenia z Furgonetką. Spróbuj ponownie za chwilę.");
        }
    }

    @Override
    public CarrierShipment track(CarrierContext ctx, String externalId, String trackingNumber) {
        JsonNode t = get(ctx, "/packages/" + enc(externalId) + "/tracking");
        JsonNode events = t.path("tracking");
        if (events.isEmpty()) return new CarrierShipment(externalId, trackingNumber, null, ShipmentStatus.READY);
        // The newest status: the latest datetime (ISO 8601 sorts lexicographically).
        JsonNode last = events.get(0);
        for (JsonNode e : events) {
            if (e.path("datetime").asString("").compareTo(last.path("datetime").asString("")) > 0) last = e;
        }
        String state = last.path("state").asString("");
        ShipmentStatus status = switch (state) {
            case "delivered" -> ShipmentStatus.DELIVERED;
            case "returned" -> ShipmentStatus.RETURNED;
            case "canceled" -> ShipmentStatus.CANCELED;
            case "waiting-for-receiver" -> ShipmentStatus.READY_FOR_PICKUP;
            case "waiting", "ordered" -> ShipmentStatus.READY;
            default -> ShipmentStatus.IN_TRANSIT;
        };
        String label = last.path("status").asString(state);
        return new CarrierShipment(externalId, trackingNumber, truncate(label, 60), status);
    }

    @Override
    public CarrierShipment track(CarrierContext ctx, String trackingNumber) {
        throw new CarrierException("Furgonetka śledzi przesyłki po identyfikatorze przesyłki.");
    }

    // ------------------------------------------------------------------ points

    @Override
    public List<Point> searchPoints(CarrierContext ctx, CarrierService service, String query) {
        if (service == null || !POINT_CARRIERS.contains(service.courier())) return List.of();
        Map<String, Object> body = Map.of("location", Map.of("search_phrase", query),
                "filters", Map.of("services", List.of(service.courier())), "limit", 20);
        List<Point> out = new ArrayList<>();
        for (JsonNode p : send(ctx, "POST", "/points/map", body).path("points")) {
            if (p.has("active") && !p.path("active").asBoolean() || p.has("is_delivery_point") && !p.path("is_delivery_point").asBoolean()) continue;
            out.add(point(p));
        }
        return out;
    }

    @Override
    public Optional<Point> point(CarrierContext ctx, CarrierService service, String code) {
        if (service == null || !POINT_CARRIERS.contains(service.courier())) return Optional.empty();
        Map<String, Object> body = Map.of("location", Map.of("search_phrase", code),
                "filters", Map.of("services", List.of(service.courier()), "point_id", code), "limit", 1);
        for (JsonNode p : send(ctx, "POST", "/points/map", body).path("points")) {
            Point point = point(p);
            if (point.code().equalsIgnoreCase(code)) return Optional.of(point);
        }
        return Optional.empty();
    }

    private static Point point(JsonNode p) {
        JsonNode a = p.path("address");
        String address = String.join(", ", java.util.stream.Stream.of(a.path("street").asString(""),
                (a.path("postcode").asString("") + " " + a.path("city").asString("")).strip()).filter(x -> !x.isBlank()).toList());
        String code = p.path("code").asString(p.path("point_id").asString(""));
        return new Point(code, p.path("name").asString(code), address, p.path("description").asString(null));
    }

    @Override
    public List<Point> searchPoints(boolean sandbox, String query) {
        return List.of(); // points need the store's account (see the overload with context)
    }

    @Override
    public Optional<Point> point(boolean sandbox, String code) {
        return Optional.empty();
    }

    @Override
    public String trackingUrl(String trackingNumber) {
        return "https://furgonetka.pl/zlokalizuj?parcelNumber=" + enc(trackingNumber);
    }

    // ------------------------------------------------------------------ HTTP

    private JsonNode get(CarrierContext ctx, String path) {
        return call(() -> http.get().uri(base(ctx.sandbox()) + path).headers(h -> h.setBearerAuth(ctx.require("accessToken")))
                .accept(MediaType.parseMediaType(MEDIA)).retrieve().body(String.class));
    }

    private JsonNode send(CarrierContext ctx, String method, String path, Object body) {
        String payload = json.writeValueAsString(body);
        return call(() -> http.method(org.springframework.http.HttpMethod.valueOf(method)).uri(base(ctx.sandbox()) + path)
                .headers(h -> h.setBearerAuth(ctx.require("accessToken"))).contentType(MediaType.parseMediaType(MEDIA))
                .accept(MediaType.parseMediaType(MEDIA)).body(payload).retrieve().body(String.class));
    }

    private JsonNode call(java.util.function.Supplier<String> request) {
        try {
            String body = request.get();
            return body == null || body.isBlank() ? json.createObjectNode() : json.readTree(body);
        } catch (RestClientResponseException e) {
            throw new CarrierException(error(e));
        } catch (RestClientException e) {
            throw new CarrierException("Brak połączenia z Furgonetką. Spróbuj ponownie za chwilę.");
        }
    }

    /** Readable message from Furgonetka's error body ({"errors":[{"path","message"}]} or OAuth errors). */
    private String error(RestClientResponseException e) {
        if (e.getStatusCode().value() == 401) return "Furgonetka odrzuciła logowanie — połącz konto ponownie.";
        try {
            JsonNode b = json.readTree(e.getResponseBodyAsString());
            List<String> messages = new ArrayList<>();
            for (JsonNode err : b.path("errors")) {
                String m = err.path("message").asString("");
                String path = err.path("path").asString("");
                if (!m.isBlank()) messages.add(path.isBlank() ? m : path + ": " + m);
            }
            if (!messages.isEmpty()) return "Furgonetka: " + String.join("; ", messages.subList(0, Math.min(3, messages.size())));
            String m = b.path("error_description").asString(b.path("message").asString(""));
            if (!m.isBlank()) return "Furgonetka: " + m;
        } catch (RuntimeException ignored) {
            // not JSON
        }
        return "Furgonetka odrzuciła żądanie (HTTP " + e.getStatusCode().value() + ").";
    }

    private static int cm(Integer mm) {
        return mm == null ? 1 : Math.max(1, (int) Math.ceil(mm / 10.0));
    }

    private static void put(Map<String, Object> m, String k, String v) {
        if (v != null && !v.isBlank()) m.put(k, v.strip());
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    private static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }
}

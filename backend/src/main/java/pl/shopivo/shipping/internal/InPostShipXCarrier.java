package pl.shopivo.shipping.internal;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import pl.shopivo.orders.OrderModel.ShippingType;
import pl.shopivo.shipping.CarrierAdapter;
import pl.shopivo.shipping.CarrierModels.CarrierContext;
import pl.shopivo.shipping.CarrierModels.CarrierDescriptor;
import pl.shopivo.shipping.CarrierModels.CarrierException;
import pl.shopivo.shipping.CarrierModels.CarrierShipment;
import pl.shopivo.shipping.CarrierModels.CredentialField;
import pl.shopivo.shipping.CarrierModels.Point;
import pl.shopivo.shipping.CarrierModels.SendingMethod;
import pl.shopivo.shipping.CarrierModels.ShipmentRequest;
import pl.shopivo.shipping.CarrierModels.ShipmentStatus;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * InPost ShipX API (Paczkomaty and courier) with the merchant's organisation id and API token. Written against the
 * public ShipX documentation and tested against a local stand-in — it must be verified on the ShipX sandbox with a
 * real account before production use.
 */
@Component
class InPostShipXCarrier implements CarrierAdapter {

    static final String ID = "inpost";
    private static final CarrierDescriptor DESCRIPTOR = new CarrierDescriptor(ID, "InPost",
            "Paczkomaty InPost i Kurier InPost przez API ShipX (konto w Managerze Paczek).",
            List.of(new CredentialField("organizationId", "ID organizacji", false, "Manager Paczek → Moje konto → API"),
                    new CredentialField("token", "Token API ShipX", true, "Manager Paczek → Moje konto → API")),
            List.of(ShippingType.PARCEL_LOCKER, ShippingType.COURIER), "https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/overview");
    private static final Pattern CODE = Pattern.compile("^[A-Z]{3}[0-9]{2,4}[A-Z]{0,3}$");
    private static final Pattern POSTAL = Pattern.compile("^\\d{2}-?\\d{3}$");
    /** "ul. Długa 3/5" → street "ul. Długa", building "3/5". */
    private static final Pattern STREET = Pattern.compile("^(.*?)[\\s,]+(\\d+[A-Za-z]?(?:\\s*/\\s*\\d+[A-Za-z]?)?)$");

    private final RestClient http;
    private final JsonMapper json;
    private final String apiUrl;
    private final String sandboxApiUrl;
    private final String pointsUrl;
    private final String sandboxPointsUrl;

    InPostShipXCarrier(JsonMapper json,
            @Value("${shopivo.shipping.inpost.api-url:https://api-shipx-pl.easypack24.net}") String apiUrl,
            @Value("${shopivo.shipping.inpost.sandbox-api-url:https://sandbox-api-shipx-pl.easypack24.net}") String sandboxApiUrl,
            @Value("${shopivo.shipping.inpost.points-url:https://api-pl-points.easypack24.net}") String pointsUrl,
            @Value("${shopivo.shipping.inpost.sandbox-points-url:https://sandbox-api-pl-points.easypack24.net}") String sandboxPointsUrl) {
        this.json = json;
        this.apiUrl = apiUrl;
        this.sandboxApiUrl = sandboxApiUrl;
        this.pointsUrl = pointsUrl;
        this.sandboxPointsUrl = sandboxPointsUrl;
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.http = RestClient.builder().requestFactory(factory).defaultHeader("User-Agent", "Shopivo/1.0").build();
    }

    @Override
    public CarrierDescriptor descriptor() {
        return DESCRIPTOR;
    }

    private String api(CarrierContext ctx) {
        return ctx.sandbox() ? sandboxApiUrl : apiUrl;
    }

    @Override
    public void testConnection(CarrierContext ctx) {
        call(() -> http.get().uri(api(ctx) + "/v1/organizations/{id}", ctx.require("organizationId"))
                .header("Authorization", "Bearer " + ctx.require("token")).retrieve().body(String.class));
    }

    @Override
    public CarrierShipment createShipment(CarrierContext ctx, ShipmentRequest r) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("receiver", receiver(r));
        boolean locker = r.type() == ShippingType.PARCEL_LOCKER;
        if (locker) {
            String template = r.parcel().template() == null ? "" : r.parcel().template().toLowerCase(Locale.ROOT);
            if (!List.of("small", "medium", "large").contains(template)) throw new CarrierException("Wybierz gabaryt paczki: A, B lub C.");
            body.put("parcels", Map.of("template", template));
        } else {
            var p = r.parcel();
            if (p.weightGrams() == null || p.weightGrams() <= 0 || p.weightGrams() > 30_000) throw new CarrierException("Podaj wagę paczki (do 30 kg).");
            if (p.lengthMm() == null || p.widthMm() == null || p.heightMm() == null) throw new CarrierException("Podaj wymiary paczki.");
            body.put("parcels", List.of(Map.of(
                    "dimensions", Map.of("length", p.lengthMm(), "width", p.widthMm(), "height", p.heightMm(), "unit", "mm"),
                    "weight", Map.of("amount", BigDecimal.valueOf(p.weightGrams()).movePointLeft(3), "unit", "kg"))));
        }
        Map<String, Object> attrs = new LinkedHashMap<>();
        if (locker) attrs.put("target_point", r.pointCode());
        attrs.put("sending_method", r.sendingMethod() == SendingMethod.COURIER_PICKUP ? "dispatch_order" : "parcel_locker");
        body.put("custom_attributes", attrs);
        body.put("service", locker ? "inpost_locker_standard" : "inpost_courier_standard");
        body.put("reference", r.reference());
        if (r.codMinor() != null && r.codMinor() > 0) {
            BigDecimal amount = BigDecimal.valueOf(r.codMinor()).movePointLeft(2);
            body.put("cod", Map.of("amount", amount, "currency", r.currency()));
            body.put("insurance", Map.of("amount", amount, "currency", r.currency()));
        }
        JsonNode res = call(() -> json.readTree(http.post().uri(api(ctx) + "/v1/organizations/{id}/shipments", ctx.require("organizationId"))
                .header("Authorization", "Bearer " + ctx.require("token")).contentType(MediaType.APPLICATION_JSON)
                .body(json.writeValueAsString(body)).retrieve().body(String.class)));
        return shipment(res);
    }

    private Map<String, Object> receiver(ShipmentRequest r) {
        var rc = r.recipient();
        Map<String, Object> m = new LinkedHashMap<>();
        String[] names = rc.name() == null ? new String[] {""} : rc.name().strip().split("\\s+", 2);
        m.put("first_name", names[0]);
        m.put("last_name", names.length > 1 ? names[1] : names[0]);
        if (rc.company() != null) m.put("company_name", rc.company());
        m.put("email", rc.email());
        m.put("phone", phone(rc.phone()));
        if (r.type() != ShippingType.PARCEL_LOCKER) {
            Matcher sm = STREET.matcher(rc.line1() == null ? "" : rc.line1().strip());
            if (!sm.matches()) throw new CarrierException("Adres odbiorcy musi zawierać numer budynku (np. „ul. Długa 3”).");
            m.put("address", Map.of("street", sm.group(1), "building_number", sm.group(2).replace(" ", ""), "city", rc.city(),
                    "post_code", rc.postalCode(), "country_code", rc.countryCode() == null ? "PL" : rc.countryCode()));
        }
        return m;
    }

    /** ShipX expects a 9-digit Polish number. */
    static String phone(String raw) {
        String digits = raw == null ? "" : raw.replaceAll("\\D", "");
        if (digits.length() == 11 && digits.startsWith("48")) digits = digits.substring(2);
        if (digits.length() != 9) throw new CarrierException("InPost wymaga 9-cyfrowego numeru telefonu odbiorcy.");
        return digits;
    }

    @Override
    public CarrierShipment shipment(CarrierContext ctx, String externalId) {
        return shipment(call(() -> json.readTree(http.get().uri(api(ctx) + "/v1/shipments/{id}", externalId)
                .header("Authorization", "Bearer " + ctx.require("token")).retrieve().body(String.class))));
    }

    @Override
    public byte[] label(CarrierContext ctx, String externalId) {
        return call(() -> http.get().uri(api(ctx) + "/v1/shipments/{id}/label?format=Pdf&type=A6", externalId)
                .header("Authorization", "Bearer " + ctx.require("token")).accept(MediaType.APPLICATION_PDF).retrieve().body(byte[].class));
    }

    @Override
    public CarrierShipment track(CarrierContext ctx, String trackingNumber) {
        JsonNode res = call(() -> json.readTree(http.get().uri(api(ctx) + "/v1/tracking/{number}", trackingNumber).retrieve().body(String.class)));
        String status = res.path("status").asString(null);
        return new CarrierShipment(null, trackingNumber, status, map(status));
    }

    private CarrierShipment shipment(JsonNode n) {
        String status = n.path("status").asString(null);
        String id = n.path("id").isMissingNode() || n.path("id").isNull() ? null : n.path("id").asString();
        String tracking = n.path("tracking_number").isNull() ? null : n.path("tracking_number").asString(null);
        return new CarrierShipment(id, tracking == null || tracking.isBlank() ? null : tracking, status, map(status));
    }

    /** ShipX statuses → our lifecycle. Unknown statuses after confirmation count as "in transit". */
    static ShipmentStatus map(String status) {
        if (status == null) return ShipmentStatus.PENDING;
        return switch (status) {
            case "created", "offers_prepared", "offer_selected" -> ShipmentStatus.PENDING;
            case "confirmed" -> ShipmentStatus.READY;
            case "ready_to_pickup", "ready_to_pickup_from_branch", "pickup_reminder_sent" -> ShipmentStatus.READY_FOR_PICKUP;
            case "delivered" -> ShipmentStatus.DELIVERED;
            case "returned_to_sender" -> ShipmentStatus.RETURNED;
            case "canceled", "cancelled" -> ShipmentStatus.CANCELED;
            default -> ShipmentStatus.IN_TRANSIT;
        };
    }

    @Override
    public List<Point> searchPoints(boolean sandbox, String query) {
        String q = query == null ? "" : query.strip();
        if (q.length() < 2 || q.length() > 60) return List.of();
        String param = POSTAL.matcher(q).matches() ? "relative_post_code" : "city";
        String value = param.equals("relative_post_code") && !q.contains("-") ? q.substring(0, 2) + "-" + q.substring(2) : q;
        JsonNode res = call(() -> json.readTree(http.get().uri((sandbox ? sandboxPointsUrl : pointsUrl)
                + "/v1/points?" + param + "={v}&type=parcel_locker&status=Operating&per_page=10", value).retrieve().body(String.class)));
        List<Point> points = new ArrayList<>();
        for (JsonNode p : res.path("items")) points.add(point(p));
        return points;
    }

    @Override
    public Optional<Point> point(boolean sandbox, String code) {
        String c = code == null ? "" : code.strip().toUpperCase(Locale.ROOT);
        if (!CODE.matcher(c).matches()) return Optional.empty();
        try {
            return Optional.of(point(json.readTree(http.get().uri((sandbox ? sandboxPointsUrl : pointsUrl) + "/v1/points/{code}", c)
                    .retrieve().body(String.class))));
        } catch (HttpClientErrorException.NotFound e) {
            return Optional.empty();
        } catch (RestClientException e) {
            throw new CarrierException("Nie udało się sprawdzić paczkomatu w InPost. Spróbuj ponownie za chwilę.");
        }
    }

    private static Point point(JsonNode p) {
        String line1 = p.path("address").path("line1").asString("");
        String line2 = p.path("address").path("line2").asString("");
        return new Point(p.path("name").asString(), p.path("name").asString(), (line1 + (line2.isBlank() ? "" : ", " + line2)).strip(),
                p.path("location_description").asString(null));
    }

    @Override
    public String trackingUrl(String trackingNumber) {
        return "https://inpost.pl/sledzenie-przesylek?number=" + trackingNumber;
    }

    private <T> T call(java.util.function.Supplier<T> action) {
        try {
            return action.get();
        } catch (HttpClientErrorException e) {
            throw new CarrierException(describe(e.getStatusCode(), e.getResponseBodyAsString()));
        } catch (HttpServerErrorException e) {
            throw new CarrierException("InPost chwilowo nie odpowiada (" + e.getStatusCode().value() + "). Spróbuj ponownie za chwilę.");
        } catch (RestClientException e) {
            throw new CarrierException("Nie udało się połączyć z InPost. Spróbuj ponownie za chwilę.");
        }
    }

    /** ShipX errors: {"status":400,"error":"validation_failed","message":"...","details":{...}}. */
    private String describe(HttpStatusCode status, String body) {
        if (status.value() == 401 || status.value() == 403) return "InPost odrzucił dane dostępowe (sprawdź ID organizacji i token).";
        try {
            JsonNode n = json.readTree(body);
            String message = n.path("message").asString("");
            String details = n.path("details").isMissingNode() || n.path("details").isNull() ? "" : " " + n.path("details").toString();
            String text = (message + details).strip();
            if (!text.isEmpty()) return "InPost: " + (text.length() > 300 ? text.substring(0, 300) : text);
        } catch (RuntimeException ignored) {
            // not JSON
        }
        return "InPost odrzucił żądanie (" + status.value() + ").";
    }
}

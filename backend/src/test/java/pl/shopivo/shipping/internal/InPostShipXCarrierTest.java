package pl.shopivo.shipping.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pl.shopivo.orders.OrderModel.ShippingType;
import pl.shopivo.shipping.CarrierModels.CarrierContext;
import pl.shopivo.shipping.CarrierModels.CarrierException;
import pl.shopivo.shipping.CarrierModels.ParcelSpec;
import pl.shopivo.shipping.CarrierModels.Recipient;
import pl.shopivo.shipping.CarrierModels.SendingMethod;
import pl.shopivo.shipping.CarrierModels.ShipmentRequest;
import pl.shopivo.shipping.CarrierModels.ShipmentStatus;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** The adapter against a local stand-in for ShipX: exact requests (per the public API docs) and response handling. */
class InPostShipXCarrierTest {

    record Call(String method, String path, String auth, String body) {
    }

    private final JsonMapper json = JsonMapper.builder().build();
    private final List<Call> calls = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private InPostShipXCarrier carrier;
    private final CarrierContext ctx = new CarrierContext(Map.of("organizationId", "1234", "token", "tok-xyz"), true);

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            String path = ex.getRequestURI().toString();
            calls.add(new Call(ex.getRequestMethod(), path, ex.getRequestHeaders().getFirst("Authorization"), body));
            int status = 200;
            String type = "application/json";
            String out;
            if (path.startsWith("/v1/organizations/1234/shipments")) {
                out = "{\"id\":98765,\"status\":\"created\",\"tracking_number\":null}";
            } else if (path.startsWith("/v1/organizations/1234")) {
                out = "tok-xyz".equals(bearer(ex.getRequestHeaders().getFirst("Authorization"))) ? "{\"id\":1234}" : null;
                if (out == null) {
                    status = 401;
                    out = "{\"status\":401,\"error\":\"token_invalid\",\"message\":\"Token is missing or invalid.\"}";
                }
            } else if (path.equals("/v1/shipments/98765")) {
                out = "{\"id\":98765,\"status\":\"confirmed\",\"tracking_number\":\"620000000000000000000001\"}";
            } else if (path.startsWith("/v1/shipments/98765/label")) {
                type = "application/pdf";
                out = "%PDF-1.4 label";
            } else if (path.startsWith("/v1/tracking/")) {
                out = "{\"tracking_number\":\"620000000000000000000001\",\"status\":\"ready_to_pickup\"}";
            } else if (path.startsWith("/v1/points/KRA010")) {
                out = "{\"name\":\"KRA010\",\"address\":{\"line1\":\"Wielicka 28\",\"line2\":\"30-552 Kraków\"},\"location_description\":\"Przy Biedronce\"}";
            } else if (path.startsWith("/v1/points/")) {
                status = 404;
                out = "{\"status\":404,\"error\":\"resource_not_found\"}";
            } else if (path.startsWith("/v1/points?")) {
                out = "{\"items\":[{\"name\":\"KRA010\",\"address\":{\"line1\":\"Wielicka 28\",\"line2\":\"30-552 Kraków\"}}]}";
            } else {
                status = 404;
                out = "{}";
            }
            byte[] bytes = out.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", type);
            ex.sendResponseHeaders(status, bytes.length);
            ex.getResponseBody().write(bytes);
            ex.close();
        });
        server.start();
        String url = "http://127.0.0.1:" + server.getAddress().getPort();
        carrier = new InPostShipXCarrier(json, url + "/prod-not-used", url, url + "/prod-not-used", url);
    }

    private static String bearer(String h) {
        return h != null && h.startsWith("Bearer ") ? h.substring(7) : null;
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void createsALockerShipmentWithCashOnDelivery() {
        var shipment = carrier.createShipment(ctx, new ShipmentRequest(ShippingType.PARCEL_LOCKER,
                new Recipient("Anna Maria Kowalska", null, "anna@example.com", "+48 600-100-200", null, null, null, "PL"), "KRA010",
                new ParcelSpec("medium", null, null, null, null), "Zamówienie 1001", 12350L, "PLN", SendingMethod.PARCEL_LOCKER));
        assertThat(shipment.externalId()).isEqualTo("98765");
        assertThat(shipment.status()).isEqualTo(ShipmentStatus.PENDING);
        Call call = calls.getLast();
        assertThat(call.method()).isEqualTo("POST");
        assertThat(call.path()).isEqualTo("/v1/organizations/1234/shipments");
        assertThat(call.auth()).isEqualTo("Bearer tok-xyz");
        JsonNode body = json.readTree(call.body());
        assertThat(body.get("service").asString()).isEqualTo("inpost_locker_standard");
        assertThat(body.get("parcels").get("template").asString()).isEqualTo("medium");
        assertThat(body.get("custom_attributes").get("target_point").asString()).isEqualTo("KRA010");
        assertThat(body.get("custom_attributes").get("sending_method").asString()).isEqualTo("parcel_locker");
        assertThat(body.get("receiver").get("phone").asString()).isEqualTo("600100200");
        assertThat(body.get("receiver").get("first_name").asString()).isEqualTo("Anna");
        assertThat(body.get("receiver").get("last_name").asString()).isEqualTo("Maria Kowalska");
        assertThat(body.get("receiver").has("address")).isFalse();
        assertThat(body.get("cod").get("amount").decimalValue()).isEqualByComparingTo("123.50");
        assertThat(body.get("insurance").get("amount").decimalValue()).isEqualByComparingTo("123.50");
        assertThat(body.get("reference").asString()).isEqualTo("Zamówienie 1001");
    }

    @Test
    void createsACourierShipmentWithAddressAndDimensions() {
        carrier.createShipment(ctx, new ShipmentRequest(ShippingType.COURIER,
                new Recipient("Jan Nowak", "Firma", "jan@example.com", "600100200", "ul. Długa 3/5", "30-001", "Kraków", "PL"), null,
                new ParcelSpec(null, 2500, 300, 200, 100), "Zamówienie 7", null, "PLN", SendingMethod.COURIER_PICKUP));
        JsonNode body = json.readTree(calls.getLast().body());
        assertThat(body.get("service").asString()).isEqualTo("inpost_courier_standard");
        assertThat(body.get("custom_attributes").get("sending_method").asString()).isEqualTo("dispatch_order");
        assertThat(body.get("custom_attributes").has("target_point")).isFalse();
        JsonNode address = body.get("receiver").get("address");
        assertThat(address.get("street").asString()).isEqualTo("ul. Długa");
        assertThat(address.get("building_number").asString()).isEqualTo("3/5");
        assertThat(address.get("post_code").asString()).isEqualTo("30-001");
        assertThat(body.get("parcels").get(0).get("weight").get("amount").decimalValue()).isEqualByComparingTo("2.5");
        assertThat(body.get("parcels").get(0).get("dimensions").get("unit").asString()).isEqualTo("mm");
        assertThat(body.has("cod")).isFalse();
    }

    @Test
    void rejectsInvalidInputBeforeCallingTheCarrier() {
        assertThatThrownBy(() -> carrier.createShipment(ctx, new ShipmentRequest(ShippingType.PARCEL_LOCKER,
                new Recipient("A B", null, "a@b.pl", "123", null, null, null, "PL"), "KRA010", new ParcelSpec("small", null, null, null, null),
                "x", null, "PLN", null))).isInstanceOf(CarrierException.class).hasMessageContaining("9-cyfrowego");
        assertThatThrownBy(() -> carrier.createShipment(ctx, new ShipmentRequest(ShippingType.PARCEL_LOCKER,
                new Recipient("A B", null, "a@b.pl", "600100200", null, null, null, "PL"), "KRA010", new ParcelSpec("huge", null, null, null, null),
                "x", null, "PLN", null))).isInstanceOf(CarrierException.class).hasMessageContaining("gabaryt");
        assertThatThrownBy(() -> carrier.createShipment(ctx, new ShipmentRequest(ShippingType.COURIER,
                new Recipient("A B", null, "a@b.pl", "600100200", "Rynek", "00-001", "Warszawa", "PL"), null, new ParcelSpec(null, 100, 1, 1, 1),
                "x", null, "PLN", null))).isInstanceOf(CarrierException.class).hasMessageContaining("numer budynku");
        assertThat(calls).isEmpty();
    }

    @Test
    void readsShipmentLabelTrackingAndPoints() {
        var s = carrier.shipment(ctx, "98765");
        assertThat(s.status()).isEqualTo(ShipmentStatus.READY);
        assertThat(s.trackingNumber()).isEqualTo("620000000000000000000001");
        assertThat(new String(carrier.label(ctx, "98765"), StandardCharsets.US_ASCII)).startsWith("%PDF");
        assertThat(calls.getLast().path()).isEqualTo("/v1/shipments/98765/label?format=Pdf&type=A6");
        assertThat(carrier.track(ctx, "620000000000000000000001").status()).isEqualTo(ShipmentStatus.READY_FOR_PICKUP);
        var points = carrier.searchPoints(true, "30552");
        assertThat(points).hasSize(1);
        assertThat(calls.getLast().path()).contains("relative_post_code=30-552").contains("type=parcel_locker");
        assertThat(carrier.point(true, "kra010")).get().satisfies(p -> assertThat(p.address()).isEqualTo("Wielicka 28, 30-552 Kraków"));
        assertThat(carrier.point(true, "WAW99X")).isEmpty();
        assertThat(carrier.point(true, "../etc")).isEmpty();
    }

    @Test
    void mapsCarrierStatusesAndErrors() {
        assertThat(InPostShipXCarrier.map("created")).isEqualTo(ShipmentStatus.PENDING);
        assertThat(InPostShipXCarrier.map("taken_by_courier")).isEqualTo(ShipmentStatus.IN_TRANSIT);
        assertThat(InPostShipXCarrier.map("delivered")).isEqualTo(ShipmentStatus.DELIVERED);
        assertThat(InPostShipXCarrier.map("returned_to_sender")).isEqualTo(ShipmentStatus.RETURNED);
        carrier.testConnection(ctx);
        assertThatThrownBy(() -> carrier.testConnection(new CarrierContext(Map.of("organizationId", "1234", "token", "zly"), true)))
                .isInstanceOf(CarrierException.class).hasMessageContaining("odrzucił dane dostępowe");
    }
}

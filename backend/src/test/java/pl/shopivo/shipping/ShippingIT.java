package pl.shopivo.shipping;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

class ShippingIT extends IntegrationTest {

    @Autowired
    Shipments shipments;
    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    record Res(int status, JsonNode json, String body) {
        String code() {
            return json != null && json.isObject() && json.has("code") ? json.get("code").asString() : null;
        }
    }

    private Res sf(String method, String host, String path, Map<String, String> headers, Object body) throws Exception {
        var b = (method.equals("GET") ? get("/api/v1/storefront" + path) : post("/api/v1/storefront" + path)).header("Host", host);
        headers.forEach(b::header);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        MockHttpServletResponse r = mvc.perform(b.with(req -> {
            req.setRemoteAddr("198.20.0." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        String content = r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return new Res(r.getStatus(), content.isBlank() ? null : jsonMapper.readTree(content), content);
    }

    @Test
    void lockerDeliveryFromCheckoutToDelivered() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("ship"));
        String slug = uniqueSlug("ship");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Sklep Wysyłkowy", slug);
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "SH-1", "priceMinor", 5000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        String variant = owner.post(base(t) + "/products", Map.of("name", "Kubek", "status", "ACTIVE", "variants", List.of(v), "version", 0))
                .json().get("variants").get(0).get("id").asString();
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 500,
                "unpaidCancelDays", 7, "version", -1));

        // A method can be linked to a carrier only after the carrier account is connected and enabled
        Map<String, Object> method = new HashMap<>(Map.of("name", "Paczkomat", "type", "PARCEL_LOCKER", "priceMinor", 1399, "active", true,
                "version", 0, "carrier", "fake"));
        assertThat(owner.post(base(t) + "/shipping-methods", method).code()).isEqualTo("CARRIER_NOT_CONNECTED");
        var saved = owner.put(base(t) + "/carriers/fake", Map.of("credentials", Map.of("apiKey", "klucz-dev-123"), "sandbox", true, "version", -1));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        assertThat(saved.body()).doesNotContain("klucz-dev-123");
        assertThat(owner.post(base(t) + "/carriers/fake/enabled", Map.of("enabled", true)).code()).isEqualTo("NOT_VERIFIED");
        owner.post(base(t) + "/carriers/fake/test", Map.of());
        owner.post(base(t) + "/carriers/fake/enabled", Map.of("enabled", true));
        var created = owner.post(base(t) + "/shipping-methods", method);
        assertThat(created.status()).as(created.body()).isEqualTo(201);
        String methodId = created.json().get("id").asString();
        assertThat(created.json().get("requiresPickupPoint").asBoolean()).isTrue();
        Map<String, Object> wrongType = new HashMap<>(method);
        wrongType.put("type", "POST");
        assertThat(owner.post(base(t) + "/shipping-methods", wrongType).code()).isEqualTo("CARRIER_UNSUPPORTED");
        publishStore(owner, t);

        // Checkout: locker search, point required and validated
        JsonNode points = sf("GET", host, "/pickup-points?metoda=" + methodId + "&q=Kraków", Map.of(), null).json();
        assertThat(points.size()).isEqualTo(3);
        String point = points.get(0).get("code").asString();
        String cart = sf("POST", host, "/cart", Map.of(), null).json().get("token").asString();
        sf("POST", host, "/cart/items", Map.of("X-Cart-Token", cart), Map.of("variantId", variant, "quantity", 2));
        Map<String, Object> c = new HashMap<>(Map.of("email", uniqueEmail("odbiorca"), "phone", "600 100 200", "firstName", "Ewa", "lastName", "Odbiorca",
                "paymentMethod", "COD", "shippingMethodId", methodId, "termsAccepted", true, "marketingConsent", false,
                "shippingAddress", Map.of("name", "Ewa Odbiorca", "line1", "ul. Długa 3", "postalCode", "30-001", "city", "Kraków", "countryCode", "PL")));
        assertThat(sf("POST", host, "/checkout", Map.of("X-Cart-Token", cart), c).code()).isEqualTo("PICKUP_POINT_REQUIRED");
        c.put("pickupPointCode", "../../x");
        assertThat(sf("POST", host, "/checkout", Map.of("X-Cart-Token", cart), c).code()).isEqualTo("PICKUP_POINT_UNKNOWN");
        c.put("pickupPointCode", point.toLowerCase());
        Res placed = sf("POST", host, "/checkout", Map.of("X-Cart-Token", cart), c);
        assertThat(placed.status()).as(placed.body()).isEqualTo(201);
        long number = placed.json().get("number").asLong();
        assertThat(sf("GET", host, "/orders/status", Map.of("X-Order-Token", placed.json().get("orderToken").asString()), null).json()
                .get("pickupPoint").get("code").asString()).isEqualTo(point);

        // Panel: shipment, label, tracking number on the order
        String orderId = owner.get(base(t) + "/orders?q=" + number).json().get("items").get(0).get("id").asString();
        assertThat(owner.get(base(t) + "/orders/" + orderId).json().get("pickupPoint").get("code").asString()).isEqualTo(point);
        assertThat(owner.post(base(t) + "/orders/" + orderId + "/shipments", Map.of("template", "huge")).code()).isEqualTo("INVALID_PARCEL");
        var shipment = owner.post(base(t) + "/orders/" + orderId + "/shipments", Map.of("template", "small", "sendingMethod", "PARCEL_LOCKER"));
        assertThat(shipment.status()).as(shipment.body()).isEqualTo(201);
        JsonNode s = shipment.json();
        assertThat(s.get("status").asString()).isEqualTo("READY");
        assertThat(s.get("trackingNumber").asString()).startsWith("FAKE");
        assertThat(s.get("labelAvailable").asBoolean()).isTrue();
        assertThat(owner.post(base(t) + "/orders/" + orderId + "/shipments", Map.of("template", "small")).code()).isEqualTo("SHIPMENT_EXISTS");
        String shipmentId = s.get("id").asString();
        var label = owner.get(base(t) + "/shipments/" + shipmentId + "/label");
        assertThat(label.status()).isEqualTo(200);
        assertThat(label.raw().getContentType()).isEqualTo("application/pdf");
        JsonNode order = owner.get(base(t) + "/orders/" + orderId).json();
        assertThat(order.get("trackingNumber").asString()).isEqualTo(s.get("trackingNumber").asString());

        // Merchant ships; tracking follows the parcel and completes the order when delivered
        // Shipping without retyping the number keeps the carrier's tracking number
        owner.post(base(t) + "/orders/" + orderId + "/status", Map.of("status", "SHIPPED", "version", order.get("version").asLong()));
        assertThat(owner.get(base(t) + "/orders/" + orderId).json().get("trackingNumber").asString()).isEqualTo(s.get("trackingNumber").asString());
        assertThat(emails.awaitEmail(c.get("email").toString(), "zostało wysłane").htmlBody()).contains("Śledź przesyłkę").contains(point);
        // First check (manual refresh): in transit — the order stays shipped
        assertThat(owner.post(base(t) + "/shipments/" + shipmentId + "/refresh", Map.of()).json().get("status").asString()).isEqualTo("IN_TRANSIT");
        assertThat(owner.get(base(t) + "/orders/" + orderId).json().get("status").asString()).isEqualTo("SHIPPED");
        // The tracking job skips recently checked parcels, then picks this one up and sees it delivered
        shipments.trackAll();
        assertThat(owner.get(base(t) + "/orders/" + orderId + "/shipments").json().get(0).get("status").asString()).isEqualTo("IN_TRANSIT");
        TenantContext.runAsSystem(() -> jdbc.update("update shipments set last_checked_at = now() - interval '1 hour' where id = ?::uuid", shipmentId));
        shipments.trackAll();
        assertThat(owner.get(base(t) + "/orders/" + orderId + "/shipments").json().get(0).get("status").asString()).isEqualTo("DELIVERED");
        assertThat(owner.get(base(t) + "/orders/" + orderId).json().get("status").asString()).isEqualTo("COMPLETED");

        // Isolation: another store cannot read the shipment or download the label
        ApiClient other = registeredUser(uniqueEmail("ship-b"));
        String tb = createStore(other, "Inny", uniqueSlug("ship-b"));
        assertThat(other.get(base(tb) + "/shipments/" + shipmentId + "/label").status()).isEqualTo(404);
        assertThat(other.post(base(tb) + "/shipments/" + shipmentId + "/refresh", Map.of()).status()).isEqualTo(404);
        assertThat(other.get(base(tb) + "/carriers").json().get("accounts").size()).isZero();
    }
}

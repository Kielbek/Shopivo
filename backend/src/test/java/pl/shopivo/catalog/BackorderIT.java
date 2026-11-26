package pl.shopivo.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** Selling on backorder must not block receiving stock afterwards. */
class BackorderIT extends IntegrationTest {

    @Test
    void stockCanBeReceivedWhileBackordersExceedOnHand() {
        ApiClient owner = registeredUser(uniqueEmail("backorder"));
        String t = createStore(owner, "Sklep Przedsprzedaż", uniqueSlug("pre"));
        Map<String, Object> v = new HashMap<>();
        v.put("optionValues", Map.of());
        v.put("sku", "PRE-1");
        v.put("priceMinor", 1000);
        v.put("trackInventory", true);
        v.put("allowBackorder", true);
        v.put("initialStock", 0);
        String variant = owner.post("/api/v1/tenants/" + t + "/products", Map.of("name", "Przedsprzedaż", "status", "ACTIVE",
                "variants", List.of(v), "version", 0)).json().get("variants").get(0).get("id").asString();
        String ship = owner.post("/api/v1/tenants/" + t + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 0,
                "active", true, "version", 0)).json().get("id").asString();
        var order = owner.post("/api/v1/tenants/" + t + "/orders", Map.of("lines", List.of(Map.of("variantId", variant, "quantity", 5)),
                "customer", Map.of("email", "a@example.com", "firstName", "A", "lastName", "B", "paymentMethod", "MANUAL", "termsAccepted", false, "marketingConsent", false,
                        "shippingMethodId", ship, "shippingAddress", Map.of("name", "A B", "line1", "Ul 1", "postalCode", "00-001", "city", "Wa"))));
        assertThat(order.status()).as(order.body()).isEqualTo(201);

        var receipt = owner.post("/api/v1/tenants/" + t + "/inventory/" + variant + "/adjust",
                Map.of("mode", "DELTA", "quantity", 3, "reason", "RECEIPT"));
        assertThat(receipt.status()).as(receipt.body()).isEqualTo(200);
        assertThat(receipt.json().get("onHand").asInt()).isEqualTo(3);
        // Removing stock below what orders reserved is still refused
        assertThat(owner.post("/api/v1/tenants/" + t + "/inventory/" + variant + "/adjust",
                Map.of("mode", "DELTA", "quantity", -1, "reason", "DAMAGE")).code()).isEqualTo("INSUFFICIENT_STOCK");
    }
}

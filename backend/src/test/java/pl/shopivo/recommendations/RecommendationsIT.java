package pl.shopivo.recommendations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

/** Recommendations computed from real orders, reviews-free store data and stock movements. */
class RecommendationsIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    record Res(int status, JsonNode json) {
    }

    private String host;

    private Res sf(String method, String path, String cart, Object body) throws Exception {
        var b = (method.equals("GET") ? get("/api/v1/storefront" + path) : post("/api/v1/storefront" + path)).header("Host", host);
        if (cart != null) b.header("X-Cart-Token", cart);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        MockHttpServletResponse r = mvc.perform(b.with(req -> {
            req.setRemoteAddr("198.51.100." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        String content = r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return new Res(r.getStatus(), content.isBlank() ? null : jsonMapper.readTree(content));
    }

    private static List<String> names(JsonNode cards) {
        List<String> out = new ArrayList<>();
        cards.forEach(c -> out.add(c.get("name").asString()));
        return out;
    }

    record P(String id, String variant) {
    }

    private P product(ApiClient owner, String t, String name, long price, Long compareAt, String category, Integer stock) {
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", name.substring(0, 3).toUpperCase() + price, "priceMinor", price,
                "trackInventory", stock != null, "allowBackorder", false, "initialStock", stock == null ? 0 : stock));
        if (compareAt != null) v.put("compareAtMinor", compareAt);
        var json = owner.post(base(t) + "/products", Map.of("name", name, "status", "ACTIVE", "categoryIds", List.of(category),
                "variants", List.of(v), "version", 0)).json();
        return new P(json.get("id").asString(), json.get("variants").get(0).get("id").asString());
    }

    private String order(List<P> items, String email) throws Exception {
        String cart = sf("POST", "/cart", null, null).json().get("token").asString();
        for (P p : items) sf("POST", "/cart/items", cart, Map.of("variantId", p.variant(), "quantity", 1));
        String shipping = sf("GET", "/checkout/options", null, null).json().get("shippingMethods").get(0).get("id").asString();
        Map<String, Object> c = new HashMap<>(Map.of("email", email, "firstName", "Ola", "lastName", "Kupująca", "paymentMethod", "COD",
                "shippingMethodId", shipping, "termsAccepted", true, "marketingConsent", false,
                "shippingAddress", Map.of("name", "Ola K", "line1", "ul. Polna 1", "postalCode", "00-001", "city", "Warszawa", "countryCode", "PL")));
        var placed = sf("POST", "/checkout", cart, c);
        assertThat(placed.status()).as(String.valueOf(placed.json())).isEqualTo(201);
        return email;
    }

    @Test
    void anEmptyListIsNotCachedSoTheFirstProductsShowUpAtOnce() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("pusty"));
        String slug = uniqueSlug("pusty");
        host = slug + ".shopivo.test";
        String t = createStore(owner, "Pusty", slug);
        String toys = owner.post(base(t) + "/categories", Map.of("name", "Zabawki", "visible", true, "version", 0)).json().get("id").asString();
        String books = owner.post(base(t) + "/categories", Map.of("name", "Książki", "visible", true, "version", 0)).json().get("id").asString();
        product(owner, t, "Klocki", 1000, null, toys, null);
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1000, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0,
                "unpaidCancelDays", 7, "version", -1));
        publishStore(owner, t);
        // An empty category: the empty answer must not be remembered
        assertThat(sf("GET", "/collections/bestsellery?kategoria=ksiazki", null, null).json().size()).isZero();
        assertThat(sf("GET", "/collections/nowosci?kategoria=ksiazki", null, null).json().size()).isZero();

        product(owner, t, "Bajki", 2000, null, books, null);
        assertThat(names(sf("GET", "/collections/bestsellery?kategoria=ksiazki", null, null).json())).containsExactly("Bajki");
        assertThat(names(sf("GET", "/collections/nowosci?kategoria=ksiazki", null, null).json())).containsExactly("Bajki");
    }

    @Test
    void listsAndProductSuggestionsComeFromTheStoresOwnOrders() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("polecane"));
        String slug = uniqueSlug("polecane");
        host = slug + ".shopivo.test";
        String t = createStore(owner, "Polecane", slug);
        String kitchen = owner.post(base(t) + "/categories", Map.of("name", "Kuchnia", "visible", true, "version", 0)).json().get("id").asString();
        String home = owner.post(base(t) + "/categories", Map.of("name", "Dom", "visible", true, "version", 0)).json().get("id").asString();
        P mug = product(owner, t, "Kubek", 5000, null, kitchen, null);
        P plate = product(owner, t, "Talerz", 5500, null, kitchen, null);
        P bowl = product(owner, t, "Misa", 6000, null, kitchen, null);
        P candle = product(owner, t, "Świeca", 3000, null, home, null);
        P blanket = product(owner, t, "Koc", 20000, 25000L, home, null);
        P vase = product(owner, t, "Wazon", 9000, null, home, 2);
        P lamp = product(owner, t, "Lampa", 15000, null, home, 0);
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1000, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0,
                "unpaidCancelDays", 7, "version", -1));
        publishStore(owner, t);

        // A store without orders still gets a non-empty bestseller list (newest products), but no fake deals
        assertThat(sf("GET", "/collections/bestsellery?limit=3", null, null).json().size()).isEqualTo(3);

        order(List.of(mug, plate), uniqueEmail("k1"));
        order(List.of(mug, plate), uniqueEmail("k2"));
        order(List.of(mug, candle), uniqueEmail("k3"));
        order(List.of(mug), uniqueEmail("k4"));
        // A big cancelled order must not count
        String cancelled = uniqueEmail("anul");
        order(List.of(bowl, bowl, candle), cancelled);
        String orderId = owner.get(base(t) + "/orders?q=" + cancelled).json().get("items").get(0).get("id").asString();
        long v = owner.get(base(t) + "/orders/" + orderId).json().get("version").asLong();
        assertThat(owner.post(base(t) + "/orders/" + orderId + "/status", Map.of("status", "CANCELED", "version", v)).status()).isEqualTo(200);

        // The lamp comes back in stock
        owner.post(base(t) + "/inventory/" + lamp.variant() + "/adjust", Map.of("mode", "DELTA", "quantity", 5, "reason", "RECEIPT"));

        List<String> best = names(sf("GET", "/collections/bestsellery?limit=4", null, null).json());
        assertThat(best.subList(0, 2)).containsExactly("Kubek", "Talerz");
        assertThat(best.indexOf("Misa")).as("cancelled orders do not count").isNotEqualTo(2);
        assertThat(names(sf("GET", "/collections/bestsellery?kategoria=dom&limit=2", null, null).json()).getFirst()).isEqualTo("Świeca");

        assertThat(names(sf("GET", "/collections/promocje", null, null).json())).containsExactly("Koc");
        assertThat(names(sf("GET", "/collections/koncowki", null, null).json())).containsExactly("Wazon");
        assertThat(names(sf("GET", "/collections/wracaja", null, null).json())).containsExactly("Lampa");
        assertThat(sf("GET", "/collections/najlepiej-oceniane", null, null).json().size()).as("padded with newest").isPositive();
        assertThat(sf("GET", "/collections/cokolwiek", null, null).status()).isEqualTo(404);
        assertThat(sf("GET", "/collections/promocje?kategoria=nie-ma", null, null).status()).isEqualTo(404);

        // Bought together: the plate twice, the candle once; the product itself never
        List<String> together = names(sf("GET", "/products/kubek/bought-together?limit=3", null, null).json());
        assertThat(together).as("only real pairs, never padded").containsExactly("Talerz", "Świeca");
        assertThat(sf("GET", "/products/koc/bought-together", null, null).json().size()).isZero();
        // Similar: same category and close price first
        List<String> similar = names(sf("GET", "/products/talerz/similar?limit=2", null, null).json());
        assertThat(similar).containsExactlyInAnyOrder("Kubek", "Misa");

        // Cart: 50 zł missing to free delivery, mug in the cart → the plate (bought together, 55 zł) closes the gap
        var cart = sf("GET", "/recommendations/cart?ids=" + mug.id() + "&brakuje=5000&limit=3", null, null).json();
        assertThat(cart.get(0).get("name").asString()).isEqualTo("Talerz");
        assertThat(names(cart)).doesNotContain("Kubek");
        assertThat(sf("GET", "/recommendations/cart?brakuje=-1", null, null).status()).isEqualTo(422);
    }
}

package pl.shopivo.reviews;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

class ReviewsIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    record Res(int status, JsonNode json) {
        String code() {
            return json != null && json.has("code") ? json.get("code").asString() : null;
        }
    }

    private Res sf(String method, String host, String path, String header, String token, Object body) throws Exception {
        var b = (method.equals("GET") ? get("/api/v1/storefront" + path) : post("/api/v1/storefront" + path)).header("Host", host);
        if (token != null) b.header(header, token);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        MockHttpServletResponse r = mvc.perform(b.with(req -> {
            req.setRemoteAddr("198.51.100." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        String content = r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return new Res(r.getStatus(), content.isBlank() ? null : jsonMapper.readTree(content));
    }

    record Shop(ApiClient owner, String tenant, String host, String mug, String plate) {
    }

    private String product(ApiClient owner, String t, String name, String sku) {
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", sku, "priceMinor", 5000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        return owner.post(base(t) + "/products", Map.of("name", name, "status", "ACTIVE", "variants", List.of(v), "version", 0))
                .json().get("variants").get(0).get("id").asString();
    }

    private Shop shop(String prefix) {
        ApiClient owner = registeredUser(uniqueEmail(prefix));
        String slug = uniqueSlug(prefix);
        String t = createStore(owner, "Pracownia", slug);
        String mug = product(owner, t, "Kubek Opinii", "OP-1");
        String plate = product(owner, t, "Talerz Opinii", "OP-2");
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1000, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0,
                "unpaidCancelDays", 7, "version", -1));
        publishStore(owner, t);
        return new Shop(owner, t, slug + ".shopivo.test", mug, plate);
    }

    /** Places an order for the mug only and completes it; returns the order id. */
    private String completedOrder(Shop s, String email) throws Exception {
        String cart = sf("POST", s.host(), "/cart", null, null, null).json().get("token").asString();
        sf("POST", s.host(), "/cart/items", "X-Cart-Token", cart, Map.of("variantId", s.mug(), "quantity", 1));
        String shipping = sf("GET", s.host(), "/checkout/options", null, null, null).json().get("shippingMethods").get(0).get("id").asString();
        Map<String, Object> c = new HashMap<>(Map.of("email", email, "firstName", "Ewa", "lastName", "Recenzentka", "paymentMethod", "COD",
                "shippingMethodId", shipping, "termsAccepted", true, "marketingConsent", false,
                "shippingAddress", Map.of("name", "Ewa R", "line1", "ul. Polna 1", "postalCode", "00-001", "city", "Warszawa", "countryCode", "PL")));
        assertThat(sf("POST", s.host(), "/checkout", "X-Cart-Token", cart, c).status()).isEqualTo(201);
        var list = s.owner().get(base(s.tenant()) + "/orders?q=" + email).json();
        String orderId = list.get("items").get(0).get("id").asString();
        long v = s.owner().get(base(s.tenant()) + "/orders/" + orderId).json().get("version").asLong();
        v = s.owner().post(base(s.tenant()) + "/orders/" + orderId + "/status", Map.of("status", "SHIPPED", "version", v)).json().get("version").asLong();
        assertThat(s.owner().post(base(s.tenant()) + "/orders/" + orderId + "/status", Map.of("status", "COMPLETED", "version", v)).status())
                .isEqualTo(200);
        return orderId;
    }

    private String tokenFromEmail(String email) {
        String body = emails.awaitEmail(email, "Jak oceniasz zakupy").textBody();
        Matcher m = Pattern.compile("/opinia#t=([A-Za-z0-9_-]+)").matcher(body);
        assertThat(m.find()).as(body).isTrue();
        return m.group(1);
    }

    @Test
    void onlyVerifiedBuyersReviewAndOnlyModeratedReviewsArePublic() throws Exception {
        Shop s = shop("rev");
        String email = uniqueEmail("buyer");
        completedOrder(s, email);
        String token = tokenFromEmail(email);
        String mugProduct = s.owner().get(base(s.tenant()) + "/products?q=Kubek").json().get("items").get(0).get("id").asString();
        String plateProduct = s.owner().get(base(s.tenant()) + "/products?q=Talerz").json().get("items").get(0).get("id").asString();

        // The invitation lists exactly the purchased products
        Res inv = sf("GET", s.host(), "/review-invitation", "X-Review-Token", token, null);
        assertThat(inv.status()).isEqualTo(200);
        assertThat(inv.json().get("suggestedAuthor").asString()).isEqualTo("Ewa R.");
        assertThat(inv.json().get("items").size()).isEqualTo(1);
        assertThat(sf("GET", s.host(), "/review-invitation", "X-Review-Token", token + "x", null).status()).isEqualTo(404);
        assertThat(sf("GET", s.host(), "/review-invitation", null, null, null).status()).isEqualTo(404);

        // Products not in the order, bad ratings and duplicates are refused
        assertThat(sf("POST", s.host(), "/reviews", "X-Review-Token", token, Map.of("productId", plateProduct, "rating", 5)).code())
                .isEqualTo("PRODUCT_NOT_IN_ORDER");
        assertThat(sf("POST", s.host(), "/reviews", "X-Review-Token", token, Map.of("productId", mugProduct, "rating", 6)).code())
                .isEqualTo("INVALID_RATING");
        assertThat(sf("POST", s.host(), "/reviews", "X-Review-Token", token,
                Map.of("productId", mugProduct, "rating", 4, "body", "Ładny, ale <b>trochę</b> mniejszy niż myślałam.")).status()).isEqualTo(201);
        assertThat(sf("POST", s.host(), "/reviews", "X-Review-Token", token, Map.of("productId", mugProduct, "rating", 1)).code())
                .isEqualTo("ALREADY_REVIEWED");
        assertThat(sf("GET", s.host(), "/review-invitation", "X-Review-Token", token, null).json().get("items").get(0).get("reviewed").asBoolean())
                .isTrue();
        assertThat(emails.awaitEmail("zamowienia@example.com", "Nowa opinia do moderacji").textBody()).contains("Kubek Opinii");

        // Pending → not public
        Res pub = sf("GET", s.host(), "/products/kubek-opinii/reviews", null, null, null);
        assertThat(pub.json().get("summary").get("count").asLong()).isZero();
        JsonNode pending = s.owner().get(base(s.tenant()) + "/reviews?status=PENDING").json();
        assertThat(pending.get("totalItems").asInt()).isEqualTo(1);
        assertThat(pending.get("items").get(0).get("productName").asString()).isEqualTo("Kubek Opinii");
        String reviewId = pending.get("items").get(0).get("id").asString();
        assertThat(s.owner().get(base(s.tenant()) + "/reviews/pending-count").json().get("count").asLong()).isEqualTo(1);

        // Approve and reply → public, text stored as plain text
        assertThat(s.owner().post(base(s.tenant()) + "/reviews/" + reviewId + "/moderation", Map.of("status", "APPROVED")).status()).isEqualTo(200);
        s.owner().put(base(s.tenant()) + "/reviews/" + reviewId + "/reply", Map.of("reply", "Dziękujemy! Wymiary są w opisie."));
        pub = sf("GET", s.host(), "/products/kubek-opinii/reviews", null, null, null);
        assertThat(pub.json().get("summary").get("average").asDouble()).isEqualTo(4.0);
        assertThat(pub.json().get("summary").get("count").asLong()).isEqualTo(1);
        JsonNode review = pub.json().get("reviews").get("items").get(0);
        assertThat(review.get("authorName").asString()).isEqualTo("Ewa R.");
        assertThat(review.get("body").asString()).contains("<b>trochę</b>");
        assertThat(review.get("reply").asString()).startsWith("Dziękujemy");
        assertThat(review.has("orderId")).isFalse();

        // Rejected reviews disappear again
        s.owner().post(base(s.tenant()) + "/reviews/" + reviewId + "/moderation", Map.of("status", "REJECTED"));
        assertThat(sf("GET", s.host(), "/products/kubek-opinii/reviews", null, null, null).json().get("summary").get("count").asLong()).isZero();

        // Isolation: the token does not work on another store; another store cannot moderate
        Shop other = shop("rev-b");
        assertThat(sf("GET", other.host(), "/review-invitation", "X-Review-Token", token, null).status()).isEqualTo(404);
        assertThat(other.owner().post(base(other.tenant()) + "/reviews/" + reviewId + "/moderation", Map.of("status", "APPROVED")).status())
                .isEqualTo(404);
        assertThat(other.owner().get(base(other.tenant()) + "/reviews").json().get("totalItems").asInt()).isZero();
    }
}

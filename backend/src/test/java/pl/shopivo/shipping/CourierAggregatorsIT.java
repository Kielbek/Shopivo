package pl.shopivo.shipping;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.FakeCouriers;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

/**
 * Courier aggregators: Apaczka with the store's App ID/Secret (signed envelope) and Furgonetka through sign-in (OAuth).
 * The store ticks services → ready shipping methods → checkout with a pickup point → shipment, label, tracking.
 */
class CourierAggregatorsIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    private JsonNode sf(String method, String host, String path, Map<String, String> headers, Object body) throws Exception {
        var b = (method.equals("GET") ? get("/api/v1/storefront" + path) : post("/api/v1/storefront" + path)).header("Host", host);
        headers.forEach(b::header);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        MockHttpServletResponse r = mvc.perform(b.with(req -> {
            req.setRemoteAddr("198.21.0." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        String c = r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return c.isBlank() ? null : jsonMapper.readTree(c);
    }

    record Shop(ApiClient owner, String tenant, String host, String variant) {
    }

    private Shop shop(String prefix) {
        ApiClient owner = registeredUser(uniqueEmail(prefix));
        String slug = uniqueSlug(prefix);
        String t = createStore(owner, "Sklep Kurierski", slug);
        var settings = owner.get(base(t) + "/store/settings").json();
        owner.put(base(t) + "/store/settings", Map.of("legalCompanyName", "Sklep Kurierski Sp. z o.o.", "taxId", "5260001246",
                "addressLine1", "ul. Magazynowa 5", "postalCode", "02-001", "city", "Warszawa", "countryCode", "PL", "phone", "500100200",
                "orderEmail", "wysylka@sklep.example", "pricesIncludeTax", true, "version", settings.get("version").asLong()));
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "AG-1", "priceMinor", 5000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        String variant = owner.post(base(t) + "/products", Map.of("name", "Świeca", "status", "ACTIVE", "variants", List.of(v), "version", 0))
                .json().get("variants").get(0).get("id").asString();
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0,
                "unpaidCancelDays", 7, "version", -1));
        return new Shop(owner, t, slug + ".shopivo.test", variant);
    }

    @Test
    void apaczkaTickServicesCheckoutWithPointShipAndTrack() throws Exception {
        Shop s = shop("apaczka");
        String t = s.tenant();
        // Keys are write-only; a wrong secret is rejected by the (signed) API
        long version = s.owner().put(base(t) + "/carriers/apaczka", Map.of("credentials", Map.of("appId", FakeCouriers.APACZKA_APP_ID, "appSecret", "zly"),
                "sandbox", true, "version", -1)).json().get("version").asLong();
        assertThat(s.owner().post(base(t) + "/carriers/apaczka/test", Map.of()).body()).contains("Invalid signature");
        var saved = s.owner().put(base(t) + "/carriers/apaczka", Map.of("credentials", Map.of("appSecret", FakeCouriers.APACZKA_SECRET),
                "sandbox", true, "version", version));
        assertThat(saved.body()).doesNotContain(FakeCouriers.APACZKA_SECRET);
        assertThat(s.owner().post(base(t) + "/carriers/apaczka/test", Map.of()).status()).isEqualTo(200);

        // Services on the account, with the delivery kinds each supports
        JsonNode services = s.owner().get(base(t) + "/carriers/apaczka/services").json();
        assertThat(services.size()).isEqualTo(2);
        assertThat(services.toString()).contains("DPD Classic", "InPost Paczkomaty", "\"courier\":\"inpost\"");
        // Locker delivery is not offered by DPD Classic here
        assertThat(s.owner().put(base(t) + "/carriers/apaczka/services", Map.of("services", List.of(
                Map.of("serviceId", "21", "type", "PARCEL_LOCKER", "priceMinor", 999)))).code()).isEqualTo("UNSUPPORTED_TYPE");

        // Tick: DPD courier 15,99 zł and InPost lockers 11,99 zł (free from 200 zł) → two ready shipping methods
        var ticked = s.owner().put(base(t) + "/carriers/apaczka/services", Map.of("services", List.of(
                Map.of("serviceId", "21", "type", "COURIER", "priceMinor", 1599),
                new HashMap<>(Map.of("serviceId", "41", "type", "PARCEL_LOCKER", "priceMinor", 1199, "freeFromMinor", 20000, "name", "Paczkomat InPost")))));
        assertThat(ticked.status()).as(ticked.body()).isEqualTo(200);
        JsonNode methods = s.owner().get(base(t) + "/shipping-methods").json();
        assertThat(methods.toString()).contains("\"carrier\":\"apaczka:21\"", "\"carrier\":\"apaczka:41\"", "Paczkomat InPost", "DPD Classic — kurier");
        String lockerMethod = null;
        for (JsonNode m : methods) if ("apaczka:41".equals(m.path("carrier").asString())) lockerMethod = m.get("id").asString();
        assertThat(s.owner().get(base(t) + "/carriers").json().get("accounts").get(0).get("services").size()).isEqualTo(2);

        // Checkout: pickup points from the account, chosen point validated
        publishStore(s.owner(), t);
        JsonNode points = sf("GET", s.host(), "/pickup-points?metoda=" + lockerMethod + "&q=warszawa", Map.of(), null);
        assertThat(points.get(0).get("code").asString()).isEqualTo("WAW01M");
        String cart = sf("POST", s.host(), "/cart", Map.of(), null).get("token").asString();
        sf("POST", s.host(), "/cart/items", Map.of("X-Cart-Token", cart), Map.of("variantId", s.variant(), "quantity", 1));
        JsonNode placed = sf("POST", s.host(), "/checkout", Map.of("X-Cart-Token", cart), Map.of("email", uniqueEmail("odb"), "phone", "600100200",
                "firstName", "Ewa", "lastName", "Odbiorca", "paymentMethod", "COD", "shippingMethodId", lockerMethod, "termsAccepted", true,
                "marketingConsent", false, "pickupPointCode", "WAW01M",
                "shippingAddress", Map.of("name", "Ewa Odbiorca", "line1", "ul. Długa 3", "postalCode", "00-001", "city", "Warszawa", "countryCode", "PL")));
        assertThat(placed.get("number")).as(placed.toString()).isNotNull();
        String orderId = s.owner().get(base(t) + "/orders?q=" + placed.get("number").asLong()).json().get("items").get(0).get("id").asString();

        // Shipment: order_send with the service, point and the store as sender (signed); label; tracking → delivered
        var shipment = s.owner().post(base(t) + "/orders/" + orderId + "/shipments", Map.of("template", "small"));
        assertThat(shipment.status()).as(shipment.body()).isEqualTo(201);
        assertThat(shipment.json().get("trackingNumber").asString()).startsWith("WB");
        var sent = COURIERS.calls("apaczka:order_send/").getLast().form().get("request");
        assertThat(sent).contains("\"service_id\":41", "\"foreign_address_id\":\"WAW01M\"", "ul. Testowa 1", "\"pickup\":{\"type\":\"SELF\"}"); // sender = company data (set by publishStore)
        var label = s.owner().get(base(t) + "/shipments/" + shipment.json().get("id").asString() + "/label");
        assertThat(label.status()).isEqualTo(200);
        assertThat(label.body()).startsWith("%PDF-");
        var refreshed = s.owner().post(base(t) + "/shipments/" + shipment.json().get("id").asString() + "/refresh", Map.of()).json();
        assertThat(refreshed.get("status").asString()).isEqualTo("DELIVERED");
        assertThat(refreshed.get("trackingUrl").asString()).startsWith("https://www.apaczka.pl/sledzenie-przesylek/?numer=WB");

        // Untick DPD → its method is switched off (kept for history), lockers stay
        s.owner().put(base(t) + "/carriers/apaczka/services", Map.of("services", List.of(
                Map.of("serviceId", "41", "type", "PARCEL_LOCKER", "priceMinor", 1199))));
        for (JsonNode m : s.owner().get(base(t) + "/shipping-methods").json()) {
            if ("apaczka:21".equals(m.path("carrier").asString())) assertThat(m.get("active").asBoolean()).isFalse();
            if ("apaczka:41".equals(m.path("carrier").asString())) assertThat(m.get("active").asBoolean()).isTrue();
        }
    }

    @Test
    void furgonetkaSignInWithSingleUseStateThenShip() throws Exception {
        Shop s = shop("furg");
        String t = s.tenant();
        // Keys cannot be typed in for an OAuth carrier
        assertThat(s.owner().put(base(t) + "/carriers/furgonetka", Map.of("credentials", Map.of(), "sandbox", true, "version", -1)).code())
                .isEqualTo("USE_CONNECT");
        String url = s.owner().post(base(t) + "/carriers/furgonetka/connect", Map.of("sandbox", true)).json().get("url").asString();
        assertThat(url).contains("/oauth/authorize?response_type=code&client_id=" + FakeCouriers.FURGONETKA_CLIENT_ID, "redirect_uri=");
        String state = java.net.URLDecoder.decode(url.replaceAll(".*state=", ""), java.nio.charset.StandardCharsets.UTF_8);

        // Wrong code → back to the panel with an error; the state is spent
        var bad = mvc.perform(get("/api/v1/oauth/carriers/furgonetka/callback").param("state", state).param("code", "zly")).andReturn().getResponse();
        assertThat(bad.getStatus()).isEqualTo(302);
        assertThat(bad.getHeader("Location")).endsWith("/sklep/" + t + "/wysylka?blad=polaczenie");
        var reused = mvc.perform(get("/api/v1/oauth/carriers/furgonetka/callback").param("state", state).param("code", "good-code")).andReturn().getResponse();
        assertThat(reused.getHeader("Location")).contains("blad=polaczenie-wygaslo");

        // Fresh sign-in → tokens stored encrypted, account verified
        String url2 = s.owner().post(base(t) + "/carriers/furgonetka/connect", Map.of("sandbox", true)).json().get("url").asString();
        String state2 = java.net.URLDecoder.decode(url2.replaceAll(".*state=", ""), java.nio.charset.StandardCharsets.UTF_8);
        var ok = mvc.perform(get("/api/v1/oauth/carriers/furgonetka/callback").param("state", state2).param("code", "good-code")).andReturn().getResponse();
        assertThat(ok.getHeader("Location")).endsWith("/sklep/" + t + "/wysylka?polaczono=furgonetka");
        JsonNode account = s.owner().get(base(t) + "/carriers").json().get("accounts").get(0);
        assertThat(account.get("verifiedAt").isNull()).isFalse();
        assertThat(s.owner().get(base(t) + "/carriers").body()).doesNotContain("furg-access-1", "def-refresh");

        // Tick InPost lockers through Furgonetka, ship to a point
        s.owner().put(base(t) + "/carriers/furgonetka/services", Map.of("services", List.of(
                Map.of("serviceId", "7001", "type", "PARCEL_LOCKER", "priceMinor", 1299))));
        String method = null;
        for (JsonNode m : s.owner().get(base(t) + "/shipping-methods").json()) if ("furgonetka:7001".equals(m.path("carrier").asString())) method = m.get("id").asString();
        publishStore(s.owner(), t);
        // Checkout shows the courier behind the aggregator service (its logo)
        for (JsonNode m : sf("GET", s.host(), "/checkout/options", Map.of(), null).get("shippingMethods")) {
            if ("furgonetka:7001".equals(m.path("carrier").asString())) assertThat(m.get("brand").asString()).isEqualTo("inpost");
            else assertThat(m.get("brand").isNull()).isTrue();
        }
        assertThat(sf("GET", s.host(), "/pickup-points?metoda=" + method + "&q=krakow", Map.of(), null).get(0).get("code").asString()).isEqualTo("KRA01M");
        String cart = sf("POST", s.host(), "/cart", Map.of(), null).get("token").asString();
        sf("POST", s.host(), "/cart/items", Map.of("X-Cart-Token", cart), Map.of("variantId", s.variant(), "quantity", 1));
        JsonNode placed = sf("POST", s.host(), "/checkout", Map.of("X-Cart-Token", cart), Map.of("email", uniqueEmail("odb"), "phone", "600100200",
                "firstName", "Jan", "lastName", "Odbiorca", "paymentMethod", "COD", "shippingMethodId", method, "termsAccepted", true,
                "marketingConsent", false, "pickupPointCode", "KRA01M",
                "shippingAddress", Map.of("name", "Jan Odbiorca", "line1", "ul. Długa 3", "postalCode", "31-001", "city", "Kraków", "countryCode", "PL")));
        String orderId = s.owner().get(base(t) + "/orders?q=" + placed.get("number").asLong()).json().get("items").get(0).get("id").asString();
        var shipment = s.owner().post(base(t) + "/orders/" + orderId + "/shipments", Map.of("template", "medium"));
        assertThat(shipment.status()).as(shipment.body()).isEqualTo(201);
        assertThat(shipment.json().get("trackingNumber").asString()).startsWith("FG");
        String pkg = COURIERS.calls("furgonetka:POST /packages").getLast().body();
        assertThat(pkg).contains("\"service_id\":7001", "\"point\":\"KRA01M\"", "\"street\":\"ul. Testowa 1\""); // the store as sender
        assertThat(COURIERS.calls("furgonetka:POST /packages").getLast().authorization()).isEqualTo("Bearer furg-access-1");
        assertThat(s.owner().get(base(t) + "/shipments/" + shipment.json().get("id").asString() + "/label").body()).startsWith("%PDF-");
        var tracked = s.owner().post(base(t) + "/shipments/" + shipment.json().get("id").asString() + "/refresh", Map.of()).json();
        assertThat(tracked.get("status").asString()).isEqualTo("DELIVERED");
        assertThat(tracked.get("trackingUrl").asString()).isEqualTo("https://furgonetka.pl/zlokalizuj?parcelNumber=" + shipment.json().get("trackingNumber").asString());

        // Another store cannot start a connection for this one
        ApiClient other = registeredUser(uniqueEmail("furg-obcy"));
        createStore(other, "Obcy", uniqueSlug("furg-obcy"));
        assertThat(other.post(base(t) + "/carriers/furgonetka/connect", Map.of("sandbox", true)).status()).isEqualTo(404);
    }
}

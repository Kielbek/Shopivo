package pl.shopivo.orders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.orders.internal.OrderJobs;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

class OrdersIT extends IntegrationTest {

    static final String IBAN = "PL61109010140000071219812874";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    OrderJobs jobs;

    record Shop(ApiClient owner, String ownerEmail, String tenant, String host, String tracked, String digital, String shippingId) {
    }

    private static String base(String tenant) {
        return "/api/v1/tenants/" + tenant;
    }

    private Shop shop(int stock) {
        String email = uniqueEmail("seller");
        ApiClient owner = registeredUser(email);
        String slug = uniqueSlug("shop");
        String t = createStore(owner, "Sklep Sprzedażowy", slug);
        String tracked = product(owner, t, "Wazon", "WAZ-1", 12000, true, stock, "PHYSICAL");
        String digital = product(owner, t, "E-book", null, 2990, false, 0, "DIGITAL");
        var shipping = owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier InPost", "type", "COURIER", "priceMinor", 1599,
                "freeFromMinor", 50000, "active", true, "version", 0));
        assertThat(shipping.status()).as(shipping.body()).isEqualTo(201);
        var settings = owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", true, "bankAccountHolder", "Sklep Sp. z o.o.",
                "bankAccountNumber", "61 1090 1014 0000 0712 1981 2874", "codEnabled", true, "codFeeMinor", 500, "unpaidCancelDays", 7, "version", -1));
        assertThat(settings.status()).as(settings.body()).isEqualTo(200);
        assertThat(settings.json().get("bankAccountNumber").asString()).isEqualTo(IBAN);
        publishStore(owner, t);
        return new Shop(owner, email, t, slug + ".shopivo.test", tracked, digital, shipping.json().get("id").asString());
    }

    private String product(ApiClient owner, String t, String name, String sku, long price, boolean track, int stock, String type) {
        Map<String, Object> v = new HashMap<>();
        v.put("optionValues", Map.of());
        v.put("sku", sku);
        v.put("priceMinor", price);
        v.put("trackInventory", track);
        v.put("allowBackorder", false);
        v.put("initialStock", stock);
        var res = owner.post(base(t) + "/products", Map.of("name", name, "status", "ACTIVE", "type", type, "variants", List.of(v), "version", 0));
        assertThat(res.status()).as(res.body()).isEqualTo(201);
        return res.json().get("variants").get(0).get("id").asString();
    }

    // ---------------------------------------------------------------- storefront http helpers

    record Res(int status, JsonNode json, String body) {
        String code() {
            return json != null && json.has("code") ? json.get("code").asString() : null;
        }
    }

    private Res sf(String method, String host, String path, String cartToken, Object body) throws Exception {
        var builder = (method.equals("GET") ? get("/api/v1/storefront" + path) : method.equals("PATCH")
                ? org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/v1/storefront" + path)
                : post("/api/v1/storefront" + path)).header("Host", host);
        if (cartToken != null) builder.header(path.startsWith("/orders") ? "X-Order-Token" : "X-Cart-Token", cartToken);
        if (body != null) builder.contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        MockHttpServletResponse r = mvc.perform(builder.with(req -> {
            req.setRemoteAddr("192.0.2." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        String content = r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return new Res(r.getStatus(), content.isBlank() ? null : jsonMapper.readTree(content), content);
    }

    private String newCart(String host) throws Exception {
        Res r = sf("POST", host, "/cart", null, null);
        assertThat(r.status()).as(r.body()).isEqualTo(201);
        return r.json().get("token").asString();
    }

    private Map<String, Object> customer(String email, String payment, String shippingId) {
        Map<String, Object> c = new HashMap<>();
        c.put("email", email);
        c.put("phone", "+48 600 100 200");
        c.put("firstName", "Anna");
        c.put("lastName", "Klientka");
        c.put("shippingAddress", Map.of("name", "Anna Klientka", "line1", "ul. Piotrkowska 1", "postalCode", "90-001", "city", "Łódź", "countryCode", "PL"));
        c.put("shippingMethodId", shippingId);
        c.put("paymentMethod", payment);
        c.put("termsAccepted", true);
        c.put("marketingConsent", false);
        return c;
    }

    // ---------------------------------------------------------------- tests

    @Test
    void storefrontCheckoutReservesStockAndMerchantFulfilsTheOrder() throws Exception {
        Shop s = shop(2);
        String cart = newCart(s.host());

        assertThat(sf("POST", s.host(), "/cart/items", cart, Map.of("variantId", s.tracked(), "quantity", 3)).code()).isEqualTo("INSUFFICIENT_STOCK");
        assertThat(sf("POST", s.host(), "/cart/items", cart, Map.of("variantId", s.tracked(), "quantity", 2)).status()).isEqualTo(200);
        Res view = sf("POST", s.host(), "/cart/items", cart, Map.of("variantId", s.digital(), "quantity", 1));
        assertThat(view.json().get("subtotalMinor").asLong()).isEqualTo(2 * 12000 + 2990);
        assertThat(view.json().get("checkoutReady").asBoolean()).isTrue();

        Res options = sf("GET", s.host(), "/checkout/options", null, null);
        assertThat(options.json().get("shippingMethods").size()).isEqualTo(1);
        assertThat(options.json().get("paymentMethods").size()).isEqualTo(2);

        // Server-side validation
        Map<String, Object> noTerms = customer("anna@example.com", "BANK_TRANSFER", s.shippingId());
        noTerms.put("termsAccepted", false);
        assertThat(sf("POST", s.host(), "/checkout", cart, noTerms).code()).isEqualTo("TERMS_REQUIRED");
        Map<String, Object> badPostal = customer("anna@example.com", "BANK_TRANSFER", s.shippingId());
        badPostal.put("shippingAddress", Map.of("name", "A", "line1", "x", "postalCode", "90001", "city", "Łódź"));
        assertThat(sf("POST", s.host(), "/checkout", cart, badPostal).code()).isEqualTo("INVALID_POSTAL_CODE");
        Map<String, Object> badNip = customer("anna@example.com", "BANK_TRANSFER", s.shippingId());
        badNip.put("billing", Map.of("invoice", true, "companyName", "Firma", "taxId", "1234567890"));
        assertThat(sf("POST", s.host(), "/checkout", cart, badNip).code()).isEqualTo("INVALID_NIP");
        assertThat(sf("POST", s.host(), "/checkout", cart, customer("anna@example.com", "MANUAL", s.shippingId())).code())
                .isEqualTo("PAYMENT_METHOD_UNAVAILABLE");

        Map<String, Object> ok = customer("Anna@Example.com", "BANK_TRANSFER", s.shippingId());
        ok.put("billing", Map.of("invoice", true, "companyName", "Pracownia Anny", "taxId", "526-000-12-46"));
        ok.put("marketingConsent", true);
        Res placed = sf("POST", s.host(), "/checkout", cart, ok);
        assertThat(placed.status()).as(placed.body()).isEqualTo(201);
        assertThat(placed.json().get("number").asLong()).isEqualTo(1001);
        long total = 2 * 12000 + 2990 + 1599;
        assertThat(placed.json().get("totalMinor").asLong()).isEqualTo(total);
        String orderToken = placed.json().get("orderToken").asString();
        assertThat(sf("POST", s.host(), "/checkout", cart, ok).code()).isEqualTo("CART_ALREADY_ORDERED");

        // Stock is reserved: nobody else can buy it
        String other = newCart(s.host());
        assertThat(sf("POST", s.host(), "/cart/items", other, Map.of("variantId", s.tracked(), "quantity", 1)).code()).isEqualTo("INSUFFICIENT_STOCK");

        // Customer confirmation page and e-mails
        Res status = sf("GET", s.host(), "/orders/status", orderToken, null);
        assertThat(status.status()).isEqualTo(200);
        assertThat(status.json().get("bankTransfer").get("bankAccountNumber").asString()).isEqualTo(IBAN);
        assertThat(sf("GET", s.host(), "/orders/status", "zly-token", null).status()).isEqualTo(404);
        assertThat(emails.awaitEmail("anna@example.com", "Potwierdzenie zamówienia nr 1001").textBody())
                .contains("61 1090 1014 0000 0712 1981 2874").contains("Wazon").contains("285,89 zł");
        assertThat(emails.awaitEmail("zamowienia@example.com", "Nowe zamówienie nr 1001").textBody()).contains("Anna Klientka");

        // Merchant side
        var list = s.owner().get(base(s.tenant()) + "/orders?q=1001").json();
        assertThat(list.get("totalItems").asInt()).isEqualTo(1);
        String orderId = list.get("items").get(0).get("id").asString();
        JsonNode order = s.owner().get(base(s.tenant()) + "/orders/" + orderId).json();
        assertThat(order.get("billing").get("taxId").asString()).isEqualTo("5260001246");
        // The exact terms the customer accepted are recorded with the order
        assertThat(order.get("termsAcceptedAt").isNull()).isFalse();
        var terms = s.owner().get(base(s.tenant()) + "/content/revisions/" + order.get("termsRevisionId").asString());
        assertThat(terms.status()).as(terms.body()).isEqualTo(200);
        assertThat(terms.json().get("body").asString()).contains("Prawo odstąpienia od umowy");
        assertThat(order.get("taxMinor").asLong()).isEqualTo(Math.round(24000 * 23 / 123.0) + Math.round(2990 * 23 / 123.0) + Math.round(1599 * 23 / 123.0));
        long version = order.get("version").asLong();
        assertThat(s.owner().post(base(s.tenant()) + "/orders/" + orderId + "/status", Map.of("status", "COMPLETED", "version", version)).code())
                .isEqualTo("INVALID_TRANSITION");
        order = s.owner().post(base(s.tenant()) + "/orders/" + orderId + "/paid", Map.of("version", version)).json();
        assertThat(order.get("paymentStatus").asString()).isEqualTo("PAID");
        assertThat(s.owner().post(base(s.tenant()) + "/orders/" + orderId + "/paid", Map.of("version", version)).code()).isEqualTo("VERSION_CONFLICT");
        order = s.owner().post(base(s.tenant()) + "/orders/" + orderId + "/status",
                Map.of("status", "SHIPPED", "trackingNumber", "620000111222333", "version", order.get("version").asLong())).json();
        assertThat(order.get("status").asString()).isEqualTo("SHIPPED");
        var inventory = s.owner().get(base(s.tenant()) + "/inventory?q=WAZ").json().get("items").get(0);
        assertThat(inventory.get("onHand").asInt()).isZero();
        assertThat(inventory.get("reserved").asInt()).isZero();
        var movements = s.owner().get(base(s.tenant()) + "/inventory/" + s.tracked() + "/movements").json();
        assertThat(movements.get(0).get("reason").asString()).isEqualTo("SALE");
        assertThat(movements.get(0).get("reference").asString()).isEqualTo("Zamówienie #1001");
        assertThat(emails.awaitEmail("anna@example.com", "zostało wysłane").textBody()).contains("620000111222333");
        assertThat(s.owner().post(base(s.tenant()) + "/orders/" + orderId + "/status",
                Map.of("status", "CANCELED", "version", order.get("version").asLong())).code()).isEqualTo("INVALID_TRANSITION");
        order = s.owner().post(base(s.tenant()) + "/orders/" + orderId + "/notes", Map.of("message", "Klientka prosiła o ostrożne pakowanie")).json();
        order = s.owner().post(base(s.tenant()) + "/orders/" + orderId + "/status", Map.of("status", "COMPLETED", "version", order.get("version").asLong())).json();
        assertThat(order.get("events").toString()).contains("ostrożne pakowanie", "Status: wysłane");

        // Customers
        var customers = s.owner().get(base(s.tenant()) + "/customers").json().get("items");
        assertThat(customers.size()).isEqualTo(1);
        assertThat(customers.get(0).get("email").asString()).isEqualTo("anna@example.com");
        assertThat(customers.get(0).get("ordersCount").asInt()).isEqualTo(1);
        assertThat(customers.get(0).get("totalSpentMinor").asLong()).isEqualTo(total);
        assertThat(s.owner().get(base(s.tenant()) + "/customers/marketing-export.csv").body()).contains("anna@example.com");
        assertThat(s.owner().get(base(s.tenant()) + "/orders/stats").json().get("orders30d").asInt()).isEqualTo(1);
    }

    @Test
    void cancelingReleasesStockAndUnpaidTransfersExpire() throws Exception {
        Shop s = shop(5);
        // Manual order from the panel (COD), then cancel
        var manual = s.owner().post(base(s.tenant()) + "/orders", Map.of("lines", List.of(Map.of("variantId", s.tracked(), "quantity", 2)),
                "customer", customer("jan@example.com", "COD", s.shippingId())));
        assertThat(manual.status()).as(manual.body()).isEqualTo(201);
        assertThat(manual.json().get("paymentFeeMinor").asLong()).isEqualTo(500);
        assertThat(manual.json().get("source").asString()).isEqualTo("PANEL");
        assertThat(s.owner().get(base(s.tenant()) + "/inventory?q=WAZ").json().get("items").get(0).get("reserved").asInt()).isEqualTo(2);
        var canceled = s.owner().post(base(s.tenant()) + "/orders/" + manual.json().get("id").asString() + "/status",
                Map.of("status", "CANCELED", "reason", "Klient zrezygnował", "version", manual.json().get("version").asLong()));
        assertThat(canceled.json().get("status").asString()).isEqualTo("CANCELED");
        var item = s.owner().get(base(s.tenant()) + "/inventory?q=WAZ").json().get("items").get(0);
        assertThat(item.get("reserved").asInt()).isZero();
        assertThat(item.get("onHand").asInt()).isEqualTo(5);
        assertThat(emails.awaitEmail("jan@example.com", "zostało anulowane").textBody()).contains("Klient zrezygnował");
        assertThat(s.owner().get(base(s.tenant()) + "/customers?q=jan").json().get("items").get(0).get("ordersCount").asInt()).isZero();

        // Bank transfer not paid in time → cancelled by the job
        String cart = newCart(s.host());
        sf("POST", s.host(), "/cart/items", cart, Map.of("variantId", s.tracked(), "quantity", 3));
        Res placed = sf("POST", s.host(), "/checkout", cart, customer("ewa@example.com", "BANK_TRANSFER", s.shippingId()));
        assertThat(placed.status()).as(placed.body()).isEqualTo(201);
        TenantContext.runAsSystem(() -> jdbc.update("update orders set created_at = now() - interval '8 days' where tenant_id = ? and number = ?",
                UUID.fromString(s.tenant()), placed.json().get("number").asLong()));
        jobs.cancelUnpaidAt(Instant.now());
        var expired = s.owner().get(base(s.tenant()) + "/orders?status=CANCELED").json().get("items");
        assertThat(expired.toString()).contains("ewa@example.com");
        assertThat(s.owner().get(base(s.tenant()) + "/inventory?q=WAZ").json().get("items").get(0).get("reserved").asInt()).isZero();
    }

    @Test
    void lastItemCannotBeSoldTwiceUnderConcurrency() throws Exception {
        Shop s = shop(1);
        List<String> carts = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            String cart = newCart(s.host());
            assertThat(sf("POST", s.host(), "/cart/items", cart, Map.of("variantId", s.tracked(), "quantity", 1)).status()).isEqualTo(200);
            carts.add(cart);
        }
        var pool = Executors.newFixedThreadPool(6);
        List<Callable<Integer>> tasks = new ArrayList<>();
        for (int i = 0; i < carts.size(); i++) {
            String cart = carts.get(i);
            String email = "k" + i + "@example.com";
            tasks.add(() -> sf("POST", s.host(), "/checkout", cart, customer(email, "COD", s.shippingId())).status());
        }
        List<Integer> results = new ArrayList<>();
        for (var f : pool.invokeAll(tasks)) results.add(f.get());
        pool.shutdown();
        assertThat(results.stream().filter(r -> r == 201).count()).isEqualTo(1);
        assertThat(results.stream().filter(r -> r == 422).count()).isEqualTo(5);
        var item = s.owner().get(base(s.tenant()) + "/inventory?q=WAZ").json().get("items").get(0);
        assertThat(item.get("reserved").asInt()).isEqualTo(1);
    }

    @Test
    void ordersAndCartsAreIsolatedBetweenStores() throws Exception {
        Shop a = shop(3);
        Shop b = shop(3);
        String cartA = newCart(a.host());
        // A cart token of store A is unknown on store B's host; B cannot add A's variants
        assertThat(sf("GET", b.host(), "/cart", cartA, null).status()).isEqualTo(404);
        String cartB = newCart(b.host());
        assertThat(sf("POST", b.host(), "/cart/items", cartB, Map.of("variantId", a.tracked(), "quantity", 1)).status()).isEqualTo(404);

        sf("POST", a.host(), "/cart/items", cartA, Map.of("variantId", a.tracked(), "quantity", 1));
        Res placed = sf("POST", a.host(), "/checkout", cartA, customer("x@example.com", "COD", a.shippingId()));
        assertThat(placed.status()).isEqualTo(201);
        // Order tokens are store-scoped too
        assertThat(sf("GET", b.host(), "/orders/status", placed.json().get("orderToken").asString(), null).status()).isEqualTo(404);
        String orderId = a.owner().get(base(a.tenant()) + "/orders").json().get("items").get(0).get("id").asString();
        assertThat(b.owner().get(base(b.tenant()) + "/orders/" + orderId).status()).isEqualTo(404);
        assertThat(b.owner().get(base(b.tenant()) + "/orders").json().get("totalItems").asInt()).isZero();
        assertThat(b.owner().get(base(b.tenant()) + "/customers").json().get("totalItems").asInt()).isZero();
        // A shipping method of another store cannot be used
        assertThat(b.owner().post(base(b.tenant()) + "/orders", Map.of("lines", List.of(Map.of("variantId", b.tracked(), "quantity", 1)),
                "customer", customer("y@example.com", "COD", a.shippingId()))).status()).isEqualTo(404);

        // Product managers cannot see orders
        String pmEmail = uniqueEmail("pm");
        ApiClient pm = registeredUser(pmEmail);
        a.owner().post("/api/v1/tenants/" + a.tenant() + "/invitations", Map.of("email", pmEmail, "role", "PRODUCT_MANAGER"));
        pm.post("/api/v1/invitations/accept", Map.of("token", emails.awaitToken(pmEmail, "Zaproszenie")));
        assertThat(pm.get(base(a.tenant()) + "/orders").status()).isEqualTo(403);
        assertThat(pm.get(base(a.tenant()) + "/customers").status()).isEqualTo(403);
    }
}

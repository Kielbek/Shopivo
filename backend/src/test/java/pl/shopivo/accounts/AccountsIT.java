package pl.shopivo.accounts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import jakarta.servlet.http.Cookie;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

class AccountsIT extends IntegrationTest {

    static final String PW = "Mocne-Haslo-Klienta-1";

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    record Res(int status, JsonNode json, String setCookie) {
        String code() {
            return json != null && json.has("code") ? json.get("code").asString() : null;
        }

        String session() {
            if (setCookie == null) return null;
            Matcher m = Pattern.compile("shopivo_customer=([^;]*)").matcher(setCookie);
            return m.find() ? m.group(1) : null;
        }
    }

    private Res call(HttpMethod method, String host, String path, String session, Object body, boolean csrfHeader, String headerName, String token)
            throws Exception {
        var b = request(method, "/api/v1/storefront" + path).header("Host", host);
        if (csrfHeader) b.header("X-Requested-With", "shopivo");
        if (session != null) b.cookie(new Cookie("shopivo_customer", session));
        if (headerName != null) b.header(headerName, token);
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        MockHttpServletResponse r = mvc.perform(b.with(req -> {
            req.setRemoteAddr("203.0.113." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        String content = r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return new Res(r.getStatus(), content.isBlank() ? null : jsonMapper.readTree(content), r.getHeader("Set-Cookie"));
    }

    private Res acc(HttpMethod method, String host, String path, String session, Object body) throws Exception {
        return call(method, host, path, session, body, true, null, null);
    }

    private Res sf(HttpMethod method, String host, String path, String header, String token, Object body) throws Exception {
        return call(method, host, path, null, body, false, header, token);
    }

    record Shop(ApiClient owner, String tenant, String host, String variant) {
    }

    private Shop shop(String prefix) {
        ApiClient owner = registeredUser(uniqueEmail(prefix));
        String slug = uniqueSlug(prefix);
        String t = createStore(owner, "Sklep Kont", slug);
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "AC-1", "priceMinor", 4000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        String variant = owner.post(base(t) + "/products", Map.of("name", "Świeca Sojowa", "status", "ACTIVE", "variants", List.of(v), "version", 0))
                .json().get("variants").get(0).get("id").asString();
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1000, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0,
                "unpaidCancelDays", 7, "version", -1));
        publishStore(owner, t);
        return new Shop(owner, t, slug + ".shopivo.test", variant);
    }

    private long order(Shop s, String email) throws Exception {
        String cart = sf(HttpMethod.POST, s.host(), "/cart", null, null, null).json().get("token").asString();
        sf(HttpMethod.POST, s.host(), "/cart/items", "X-Cart-Token", cart, Map.of("variantId", s.variant(), "quantity", 2));
        String shipping = sf(HttpMethod.GET, s.host(), "/checkout/options", null, null, null).json().get("shippingMethods").get(0).get("id").asString();
        Map<String, Object> c = new HashMap<>(Map.of("email", email, "firstName", "Ola", "lastName", "Kowal", "paymentMethod", "COD",
                "shippingMethodId", shipping, "termsAccepted", true, "marketingConsent", false,
                "shippingAddress", Map.of("name", "Ola Kowal", "line1", "ul. Lipowa 2", "postalCode", "00-002", "city", "Warszawa", "countryCode", "PL")));
        Res placed = sf(HttpMethod.POST, s.host(), "/checkout", "X-Cart-Token", cart, c);
        assertThat(placed.status()).isEqualTo(201);
        return placed.json().get("number").asLong();
    }

    private void complete(Shop s, long number) {
        String id = s.owner().get(base(s.tenant()) + "/orders?q=" + number).json().get("items").get(0).get("id").asString();
        long v = s.owner().get(base(s.tenant()) + "/orders/" + id).json().get("version").asLong();
        v = s.owner().post(base(s.tenant()) + "/orders/" + id + "/status", Map.of("status", "SHIPPED", "version", v)).json().get("version").asLong();
        s.owner().post(base(s.tenant()) + "/orders/" + id + "/status", Map.of("status", "COMPLETED", "version", v));
    }

    private String link(String email, String subject, String path) {
        String body = emails.awaitEmail(email, subject).textBody();
        Matcher m = Pattern.compile(Pattern.quote(path) + "#t=([A-Za-z0-9_-]+)").matcher(body);
        assertThat(m.find()).as(body).isTrue();
        return m.group(1);
    }

    private static Map<String, Object> registration(String email, String password) {
        return Map.of("email", email, "password", password, "firstName", "Ola", "lastName", "Kowal", "termsAccepted", true);
    }

    @Test
    void registrationVerificationSessionOrdersAndReviewsOfOwnPurchases() throws Exception {
        Shop s = shop("acc");
        String email = uniqueEmail("klientka");
        long first = order(s, email); // placed before the account existed

        // CSRF guard: the custom header is required
        assertThat(call(HttpMethod.POST, s.host(), "/account/register", null, registration(email, PW), false, null, null).code())
                .isEqualTo("MISSING_HEADER");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/register", null, registration(email, "krotkie")).code()).isEqualTo("WEAK_PASSWORD");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/register", null, registration(email, PW)).status()).isEqualTo(202);

        // Not verified: no login
        assertThat(acc(HttpMethod.POST, s.host(), "/account/login", null, Map.of("email", email, "password", PW)).code()).isEqualTo("EMAIL_NOT_VERIFIED");
        String token = link(email, "Potwierdź konto", "/konto/potwierdz");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/verify", null, Map.of("token", token, "password", "Inne-Haslo-12345")).code())
                .isEqualTo("WRONG_PASSWORD");
        Res verified = acc(HttpMethod.POST, s.host(), "/account/verify", null, Map.of("token", token, "password", PW));
        assertThat(verified.status()).isEqualTo(200);
        assertThat(verified.setCookie()).contains("HttpOnly").contains("SameSite=Lax").doesNotContain("Domain=");
        String session = verified.session();
        assertThat(acc(HttpMethod.POST, s.host(), "/account/verify", null, Map.of("token", token, "password", PW)).code()).isEqualTo("INVALID_TOKEN");

        // Session works only with the header and only on this store
        assertThat(acc(HttpMethod.GET, s.host(), "/account/me", session, null).json().get("email").asString()).isEqualTo(email);
        assertThat(call(HttpMethod.GET, s.host(), "/account/me", session, null, false, null, null).status()).isEqualTo(403);
        Shop other = shop("acc-b");
        assertThat(acc(HttpMethod.GET, other.host(), "/account/me", session, null).status()).isEqualTo(204);
        assertThat(acc(HttpMethod.GET, other.host(), "/account/orders", session, null).code()).isEqualTo("NOT_SIGNED_IN");

        // Registering again does not reveal the account (same 202, a "you already have an account" e-mail)
        assertThat(acc(HttpMethod.POST, s.host(), "/account/register", null, registration(email, PW)).status()).isEqualTo(202);
        emails.awaitEmail(email, "Masz już konto");

        // Order history: orders placed with the verified e-mail, also those from before the account
        long second = order(s, email.toUpperCase());
        JsonNode orders = acc(HttpMethod.GET, s.host(), "/account/orders", session, null).json();
        assertThat(orders.size()).isEqualTo(2);
        assertThat(orders.toString()).doesNotContain("events").doesNotContain("note");
        long foreign = order(s, uniqueEmail("ktos-inny"));
        assertThat(acc(HttpMethod.GET, s.host(), "/account/orders/" + foreign, session, null).status()).isEqualTo(404);
        assertThat(acc(HttpMethod.GET, s.host(), "/account/orders/" + first, session, null).json().get("items").get(0).get("quantity").asInt()).isEqualTo(2);

        // Reviews: only products from the account's own completed (and paid on delivery) orders
        assertThat(acc(HttpMethod.GET, s.host(), "/account/reviews/pending", session, null).json().size()).isZero();
        String product = acc(HttpMethod.GET, s.host(), "/account/orders/" + first, session, null).json().get("items").get(0).get("productId").asString();
        assertThat(acc(HttpMethod.POST, s.host(), "/account/reviews", session, Map.of("orderNumber", first, "productId", product, "rating", 5)).code())
                .isEqualTo("NOT_VERIFIED_PURCHASE");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/reviews", session, Map.of("orderNumber", foreign, "productId", product, "rating", 1)).status())
                .isEqualTo(404);
        complete(s, first);
        JsonNode pending = acc(HttpMethod.GET, s.host(), "/account/reviews/pending", session, null).json();
        assertThat(pending.size()).isEqualTo(1);
        assertThat(pending.get(0).get("orderNumber").asLong()).isEqualTo(first);
        assertThat(acc(HttpMethod.POST, s.host(), "/account/reviews", session, Map.of("orderNumber", first, "productId", product, "rating", 5,
                "body", "Pięknie pachnie")).status()).isEqualTo(201);
        assertThat(acc(HttpMethod.POST, s.host(), "/account/reviews", session, Map.of("orderNumber", first, "productId", product, "rating", 4)).code())
                .isEqualTo("ALREADY_REVIEWED");
        assertThat(acc(HttpMethod.GET, s.host(), "/account/reviews/pending", session, null).json().size()).isZero();
        assertThat(s.owner().get(base(s.tenant()) + "/reviews?status=PENDING").json().get("items").get(0).get("orderNumber").asLong()).isEqualTo(first);
        assertThat(second).isGreaterThan(first);

        // Addresses
        assertThat(acc(HttpMethod.POST, s.host(), "/account/addresses", session, Map.of("name", "Ola", "line1", "ul. A 1", "postalCode", "00000",
                "city", "Warszawa", "countryCode", "PL", "isDefault", false)).code()).isEqualTo("INVALID_POSTAL_CODE");
        JsonNode addresses = acc(HttpMethod.POST, s.host(), "/account/addresses", session, Map.of("name", "Ola Kowal", "line1", "ul. A 1",
                "postalCode", "00-001", "city", "Warszawa", "countryCode", "PL", "isDefault", false)).json();
        assertThat(addresses.get(0).get("isDefault").asBoolean()).isTrue();

        // Logout ends the session
        assertThat(acc(HttpMethod.POST, s.host(), "/account/logout", session, null).setCookie()).contains("Max-Age=0");
        assertThat(acc(HttpMethod.GET, s.host(), "/account/me", session, null).status()).isEqualTo(204);
    }

    @Test
    void someoneElsesRegistrationCannotTakeOverTheAccountAndResetAndLockoutWork() throws Exception {
        Shop s = shop("acc-sec");
        String victim = uniqueEmail("ofiara");
        // The attacker registers the victim's address first with a password they know
        assertThat(acc(HttpMethod.POST, s.host(), "/account/register", null, registration(victim, "Haslo-Napastnika-99")).status()).isEqualTo(202);
        String attackerLink = link(victim, "Potwierdź konto", "/konto/potwierdz");
        // The victim opening that link cannot activate it without the attacker's password
        assertThat(acc(HttpMethod.POST, s.host(), "/account/verify", null, Map.of("token", attackerLink, "password", PW)).code())
                .isEqualTo("WRONG_PASSWORD");
        // The victim registers with their own password and activates through their own link
        emails.clear(victim);
        acc(HttpMethod.POST, s.host(), "/account/register", null, registration(victim, PW));
        String victimLink = link(victim, "Potwierdź konto", "/konto/potwierdz");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/verify", null, Map.of("token", victimLink, "password", PW)).status()).isEqualTo(200);
        // The attacker's password does not work, and their link is void
        assertThat(acc(HttpMethod.POST, s.host(), "/account/login", null, Map.of("email", victim, "password", "Haslo-Napastnika-99")).code())
                .isEqualTo("INVALID_CREDENTIALS");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/verify", null, Map.of("token", attackerLink, "password", "Haslo-Napastnika-99")).code())
                .isEqualTo("INVALID_TOKEN");

        // Unknown e-mail and wrong password look the same
        assertThat(acc(HttpMethod.POST, s.host(), "/account/login", null, Map.of("email", uniqueEmail("nikt"), "password", PW)).code())
                .isEqualTo("INVALID_CREDENTIALS");
        Res login = acc(HttpMethod.POST, s.host(), "/account/login", null, Map.of("email", victim, "password", PW));
        String session = login.session();

        // Password reset: one-time link, policy applies, all sessions end
        assertThat(acc(HttpMethod.POST, s.host(), "/account/password-reset", null, Map.of("email", uniqueEmail("nikt"))).status()).isEqualTo(202);
        assertThat(acc(HttpMethod.POST, s.host(), "/account/password-reset", null, Map.of("email", victim)).status()).isEqualTo(202);
        String reset = link(victim, "Nowe hasło", "/konto/nowe-haslo");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/password-reset/confirm", null, Map.of("token", reset, "password", "1234567890")).code())
                .isEqualTo("WEAK_PASSWORD");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/password-reset/confirm", null, Map.of("token", reset, "password", "Nowe-Haslo-Klientki-7"))
                .status()).isEqualTo(204);
        assertThat(acc(HttpMethod.POST, s.host(), "/account/password-reset/confirm", null, Map.of("token", reset, "password", "Nowe-Haslo-Klientki-8"))
                .code()).isEqualTo("INVALID_TOKEN");
        assertThat(acc(HttpMethod.GET, s.host(), "/account/me", session, null).status()).isEqualTo(204);

        // Brute force is slowed per address — identically for existing and unknown addresses (no account enumeration)
        String nobody = uniqueEmail("nikt-nie-ma");
        for (int i = 0; i < 10; i++) {
            acc(HttpMethod.POST, s.host(), "/account/login", null, Map.of("email", victim, "password", "zle-haslo-" + i));
            acc(HttpMethod.POST, s.host(), "/account/login", null, Map.of("email", nobody, "password", "zle-haslo-" + i));
        }
        assertThat(acc(HttpMethod.POST, s.host(), "/account/login", null, Map.of("email", victim, "password", "Nowe-Haslo-Klientki-7")).code())
                .isEqualTo("RATE_LIMITED");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/login", null, Map.of("email", nobody, "password", "x")).code())
                .isEqualTo("RATE_LIMITED");
        // The limit is per store: the same address in another store is unaffected
        Shop other = shop("acc-sec-b");
        assertThat(acc(HttpMethod.POST, other.host(), "/account/login", null, Map.of("email", victim, "password", "x")).code())
                .isEqualTo("INVALID_CREDENTIALS");
    }

    @Test
    void accountDeletionRequiresThePassword() throws Exception {
        Shop s = shop("acc-del");
        String email = uniqueEmail("usun");
        acc(HttpMethod.POST, s.host(), "/account/register", null, registration(email, PW));
        String session = acc(HttpMethod.POST, s.host(), "/account/verify", null,
                Map.of("token", link(email, "Potwierdź konto", "/konto/potwierdz"), "password", PW)).session();
        assertThat(acc(HttpMethod.POST, s.host(), "/account/delete", session, Map.of("password", "zle")).code()).isEqualTo("WRONG_PASSWORD");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/delete", session, Map.of("password", PW)).status()).isEqualTo(204);
        assertThat(acc(HttpMethod.GET, s.host(), "/account/me", session, null).status()).isEqualTo(204);
        assertThat(acc(HttpMethod.POST, s.host(), "/account/login", null, Map.of("email", email, "password", PW)).code()).isEqualTo("INVALID_CREDENTIALS");
    }

    @org.springframework.beans.factory.annotation.Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    private String signedIn(Shop s, String email) throws Exception {
        acc(HttpMethod.POST, s.host(), "/account/register", null, registration(email, PW));
        return acc(HttpMethod.POST, s.host(), "/account/verify", null,
                Map.of("token", link(email, "Potwierdź konto", "/konto/potwierdz"), "password", PW)).session();
    }

    @Test
    void favouritesAndProductCards() throws Exception {
        Shop s = shop("acc-wish");
        String session = signedIn(s, uniqueEmail("ulubione"));
        String product = s.owner().get(base(s.tenant()) + "/products").json().get("items").get(0).get("id").asString();
        String foreign = java.util.UUID.randomUUID().toString();

        assertThat(acc(HttpMethod.GET, s.host(), "/account/wishlist", null, null).code()).isEqualTo("NOT_SIGNED_IN");
        // Unknown ids are ignored; adding twice keeps one entry
        JsonNode list = acc(HttpMethod.POST, s.host(), "/account/wishlist", session, Map.of("productIds", List.of(product, foreign))).json();
        assertThat(list.size()).isEqualTo(1);
        assertThat(acc(HttpMethod.POST, s.host(), "/account/wishlist", session, Map.of("productIds", List.of(product))).json().size()).isEqualTo(1);

        // Another store's account cannot see or add this store's products
        Shop other = shop("acc-wish-b");
        String otherSession = signedIn(other, uniqueEmail("ulubione-b"));
        assertThat(acc(HttpMethod.POST, other.host(), "/account/wishlist", otherSession, Map.of("productIds", List.of(product))).json().size()).isZero();

        // Public cards by id: only this store's active products
        JsonNode cards = sf(HttpMethod.GET, s.host(), "/product-cards?ids=" + product + "," + foreign, null, null, null).json();
        assertThat(cards.size()).isEqualTo(1);
        assertThat(cards.get(0).get("name").asString()).isEqualTo("Świeca Sojowa");
        assertThat(sf(HttpMethod.GET, other.host(), "/product-cards?ids=" + product, null, null, null).json().size()).isZero();

        assertThat(acc(HttpMethod.DELETE, s.host(), "/account/wishlist/" + product, session, null).json().size()).isZero();
    }

    @Test
    void returnsAndComplaintsFromTheAccountAndTheirHandlingInThePanel() throws Exception {
        Shop s = shop("acc-ret");
        String email = uniqueEmail("zwrot");
        String session = signedIn(s, email);
        long number = order(s, email);
        JsonNode o = acc(HttpMethod.GET, s.host(), "/account/orders/" + number, session, null).json();
        String orderId = s.owner().get(base(s.tenant()) + "/orders?q=" + number).json().get("items").get(0).get("id").asString();
        String item = s.owner().get(base(s.tenant()) + "/orders/" + orderId).json().get("items").get(0).get("id").asString();
        Map<String, Object> one = Map.of("kind", "WITHDRAWAL", "items", List.of(Map.of("orderItemId", item, "quantity", 1)));

        // Not shipped yet: nothing to return
        assertThat(acc(HttpMethod.GET, s.host(), "/account/orders/" + number + "/return-options", session, null).json().get("kinds").size()).isZero();
        assertThat(acc(HttpMethod.POST, s.host(), "/account/orders/" + number + "/returns", session, one).code()).isEqualTo("ORDER_NOT_SHIPPED");
        complete(s, number);
        JsonNode options = acc(HttpMethod.GET, s.host(), "/account/orders/" + number + "/return-options", session, null).json();
        assertThat(options.get("kinds").toString()).contains("WITHDRAWAL").contains("COMPLAINT");
        assertThat(options.get("returnable").get(item).asInt()).isEqualTo(2);

        // Validation: quantity, foreign line, complaint reason, bank account
        assertThat(acc(HttpMethod.POST, s.host(), "/account/orders/" + number + "/returns", session,
                Map.of("kind", "WITHDRAWAL", "items", List.of(Map.of("orderItemId", item, "quantity", 3)))).code()).isEqualTo("INVALID_QUANTITY");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/orders/" + number + "/returns", session,
                Map.of("kind", "WITHDRAWAL", "items", List.of(Map.of("orderItemId", java.util.UUID.randomUUID().toString(), "quantity", 1)))).code())
                .isEqualTo("INVALID_ITEM");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/orders/" + number + "/returns", session,
                Map.of("kind", "COMPLAINT", "reason", "zła", "items", List.of(Map.of("orderItemId", item, "quantity", 1)))).code()).isEqualTo("REASON_REQUIRED");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/orders/" + number + "/returns", session,
                Map.of("kind", "WITHDRAWAL", "refundAccount", "123", "items", List.of(Map.of("orderItemId", item, "quantity", 1)))).code())
                .isEqualTo("INVALID_ACCOUNT");
        // Someone else's order: 404
        long foreign = order(s, uniqueEmail("inny"));
        assertThat(acc(HttpMethod.POST, s.host(), "/account/orders/" + foreign + "/returns", session, one).status()).isEqualTo(404);

        Res created = acc(HttpMethod.POST, s.host(), "/account/orders/" + number + "/returns", session,
                Map.of("kind", "WITHDRAWAL", "refundAccount", "61 1090 1014 0000 0712 1981 2874", "items", List.of(Map.of("orderItemId", item, "quantity", 1))));
        assertThat(created.status()).isEqualTo(201);
        assertThat(created.json().get("status").asString()).isEqualTo("REQUESTED");
        assertThat(created.json().get("valueMinor").asLong()).isEqualTo(4000);
        assertThat(created.json().has("refundAccount")).isFalse();
        emails.awaitEmail(email, "Zwrot nr");
        // One item is left to return
        assertThat(acc(HttpMethod.GET, s.host(), "/account/orders/" + number + "/return-options", session, null).json().get("returnable").get(item).asInt())
                .isEqualTo(1);
        assertThat(acc(HttpMethod.GET, s.host(), "/account/returns", session, null).json().size()).isEqualTo(1);

        // Panel: list, decision (rejection needs a reason), completion, versioning
        JsonNode row = s.owner().get(base(s.tenant()) + "/returns?status=REQUESTED").json().get("items").get(0);
        String id = row.get("id").asString();
        assertThat(row.get("refundAccount").asString()).isEqualTo("61109010140000071219812874");
        assertThat(s.owner().get(base(s.tenant()) + "/returns/open-count").json().get("count").asLong()).isEqualTo(1);
        assertThat(s.owner().post(base(s.tenant()) + "/returns/" + id + "/complete", Map.of("version", 0)).json().get("code").asString()).isEqualTo("NOT_ACCEPTED");
        assertThat(s.owner().post(base(s.tenant()) + "/returns/" + id + "/decision", Map.of("accept", false, "version", 0)).json().get("code").asString())
                .isEqualTo("NOTE_REQUIRED");
        assertThat(s.owner().post(base(s.tenant()) + "/returns/" + id + "/decision", Map.of("accept", true, "note", "Prosimy odesłać paczkę", "version", 5))
                .status()).isEqualTo(409);
        JsonNode accepted = s.owner().post(base(s.tenant()) + "/returns/" + id + "/decision", Map.of("accept", true, "note", "Prosimy odesłać paczkę", "version", 0)).json();
        assertThat(accepted.get("status").asString()).isEqualTo("ACCEPTED");
        emails.awaitEmail(email, "Zgłoszenie zaakceptowane");
        JsonNode done = s.owner().post(base(s.tenant()) + "/returns/" + id + "/complete", Map.of("version", accepted.get("version").asLong())).json();
        assertThat(done.get("status").asString()).isEqualTo("COMPLETED");
        assertThat(acc(HttpMethod.GET, s.host(), "/account/returns", session, null).json().get(0).get("merchantNote").asString()).isEqualTo("Prosimy odesłać paczkę");

        // Another store's owner cannot see it
        Shop other = shop("acc-ret-b");
        assertThat(other.owner().get(base(s.tenant()) + "/returns/" + id).status()).isEqualTo(404);
        assertThat(other.owner().get(base(other.tenant()) + "/returns/" + id).status()).isEqualTo(404);

        // After the 14 days from delivery only a complaint is possible
        pl.shopivo.shared.tenancy.TenantContext.runAsSystem(() -> jdbc.update(
                "update orders set completed_at = now() - interval '15 days' where id = ?::uuid", orderId));
        options = acc(HttpMethod.GET, s.host(), "/account/orders/" + number + "/return-options", session, null).json();
        assertThat(options.get("kinds").toString()).doesNotContain("WITHDRAWAL").contains("COMPLAINT");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/orders/" + number + "/returns", session, one).code()).isEqualTo("PERIOD_OVER");
        assertThat(acc(HttpMethod.POST, s.host(), "/account/orders/" + number + "/returns", session, Map.of("kind", "COMPLAINT",
                "reason", "Knot odpadł po pierwszym użyciu", "items", List.of(Map.of("orderItemId", item, "quantity", 1)))).status()).isEqualTo(201);
        assertThat(o.get("number").asLong()).isEqualTo(number);
    }
}

package pl.shopivo.newsletter;

import static org.assertj.core.api.Assertions.assertThat;
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

/** Double opt-in newsletter: sign-up never reveals membership, consent is recorded on confirmation, export and isolation. */
class NewsletterIT extends IntegrationTest {

    private static final Pattern LINK_TOKEN = Pattern.compile("#t=([A-Za-z0-9_-]+)");

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    private int sf(String host, String path, Object body, boolean header) throws Exception {
        var b = post("/api/v1/storefront" + path).header("Host", host).contentType(MediaType.APPLICATION_JSON).content(jsonMapper.writeValueAsString(body));
        if (header) b.header("X-Requested-With", "shopivo");
        MockHttpServletResponse r = mvc.perform(b.with(req -> {
            req.setRemoteAddr("198.51.100." + (int) (Math.random() * 250 + 1));
            return req;
        })).andReturn().getResponse();
        return r.getStatus();
    }

    private String token(String to, String subject) {
        Matcher m = LINK_TOKEN.matcher(emails.awaitEmail(to, subject).htmlBody());
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    @Test
    void doubleOptInConfirmExportAndUnsubscribe() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("nl"));
        String slug = uniqueSlug("nl");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Sklep Newsletter", slug);
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "N-1", "priceMinor", 1000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        owner.post(base(t) + "/products", Map.of("name", "Produkt", "status", "ACTIVE", "variants", List.of(v), "version", 0));
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1000, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0, "unpaidCancelDays", 7, "version", -1));
        publishStore(owner, t);

        String email = uniqueEmail("klient");
        assertThat(sf(host, "/newsletter", Map.of("email", email), false)).isEqualTo(403);
        assertThat(sf(host, "/newsletter", Map.of("email", "nie-mail"), true)).isEqualTo(422);
        assertThat(sf(host, "/newsletter", Map.of("email", email.toUpperCase()), true)).isEqualTo(202);
        String confirm = token(email, "Potwierdź zapis");
        // Pending until confirmed; a second sign-up within a day sends no second e-mail
        assertThat(owner.get(base(t) + "/newsletter?status=PENDING").json().get("items").size()).isEqualTo(1);
        assertThat(sf(host, "/newsletter", Map.of("email", email), true)).isEqualTo(202);
        assertThat(emails.count(email, "Potwierdź zapis")).isEqualTo(1);

        assertThat(sf(host, "/newsletter/confirm", Map.of("token", "zly-token"), true)).isEqualTo(422);
        assertThat(sf(host, "/newsletter/confirm", Map.of("token", confirm), true)).isEqualTo(204);
        assertThat(sf(host, "/newsletter/confirm", Map.of("token", confirm), true)).isEqualTo(422);
        String unsubscribe = token(email, "Zapisano na newsletter");
        var summary = owner.get(base(t) + "/newsletter/summary").json().get("counts");
        assertThat(summary.get("CONFIRMED").asLong()).isEqualTo(1);
        // Already confirmed: signing up again says the same and sends nothing
        assertThat(sf(host, "/newsletter", Map.of("email", email), true)).isEqualTo(202);

        var csv = owner.get(base(t) + "/newsletter/export.csv");
        assertThat(csv.status()).isEqualTo(200);
        assertThat(csv.body()).contains(email.toLowerCase(), Newsletter.CONSENT_TEXT);

        // Another store sees nothing
        ApiClient other = registeredUser(uniqueEmail("nl-obcy"));
        createStore(other, "Obcy", uniqueSlug("nl-obcy"));
        assertThat(other.get(base(t) + "/newsletter").status()).isEqualTo(404);
        assertThat(other.get(base(t) + "/newsletter/export.csv").status()).isEqualTo(404);

        assertThat(sf(host, "/newsletter/unsubscribe", Map.of("token", unsubscribe), true)).isEqualTo(204);
        assertThat(owner.get(base(t) + "/newsletter/summary").json().get("counts").get("UNSUBSCRIBED").asLong()).isEqualTo(1);
        assertThat(owner.get(base(t) + "/newsletter/export.csv").body()).doesNotContain(email.toLowerCase());
    }

    @Test
    void csvCellsCannotInjectFormulas() {
        assertThat(Newsletter.csv("=HYPERLINK(\"x\")")).isEqualTo("\"'=HYPERLINK(\"\"x\"\")\"");
        assertThat(Newsletter.csv("jan@example.com")).isEqualTo("\"jan@example.com\"");
    }
}

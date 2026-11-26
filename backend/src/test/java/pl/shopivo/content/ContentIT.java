package pl.shopivo.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

class ContentIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    private MockHttpServletResponse sf(String host, String path) throws Exception {
        return mvc.perform(get("/api/v1/storefront" + path).header("Host", host)).andReturn().getResponse();
    }

    private JsonNode json(MockHttpServletResponse r) throws Exception {
        return jsonMapper.readTree(r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    private static Map<String, Object> entry(String kind, String title, String slug, String body, String status, long version) {
        Map<String, Object> m = new HashMap<>();
        m.put("kind", kind);
        m.put("title", title);
        if (slug != null) m.put("slug", slug);
        m.put("body", body);
        m.put("status", status);
        m.put("version", version);
        return m;
    }

    private void sellable(ApiClient owner, String t) {
        Map<String, Object> v = new HashMap<>(Map.of("optionValues", Map.of(), "sku", "C-1", "priceMinor", 1000, "trackInventory", false,
                "allowBackorder", false, "initialStock", 0));
        owner.post(base(t) + "/products", Map.of("name", "Herbata Zielona", "status", "ACTIVE", "variants", List.of(v), "version", 0));
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1500, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0,
                "unpaidCancelDays", 7, "version", -1));
    }

    @Test
    void legalPagesAreRequiredVersionedAndStayOnlineWhileTheStoreIsPublished() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("legal"));
        String slug = uniqueSlug("legal");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Herbaciarnia", slug);
        sellable(owner, t);
        var settings = owner.get(base(t) + "/store/settings").json();
        owner.put(base(t) + "/store/settings", Map.of("legalCompanyName", "Herbaciarnia Jan Kowalski", "taxId", "5260001246",
                "addressLine1", "ul. Liściasta 3", "postalCode", "00-950", "city", "Warszawa", "countryCode", "PL",
                "orderEmail", "sklep@herbaciarnia.example", "pricesIncludeTax", true, "version", settings.get("version").asLong()));

        // Without terms and privacy policy the store cannot open
        assertThat(owner.get(base(t) + "/store/publish-readiness").json().get("missing").toString())
                .contains("Regulamin sklepu", "Polityka prywatności");

        // Templates are filled with the store's data and start as drafts
        var terms = owner.post(base(t) + "/content/legal/TERMS", Map.of());
        assertThat(terms.status()).as(terms.body()).isEqualTo(201);
        assertThat(terms.json().get("status").asString()).isEqualTo("DRAFT");
        assertThat(terms.json().get("slug").asString()).isEqualTo("regulamin");
        assertThat(terms.json().get("body").asString()).contains("Herbaciarnia Jan Kowalski", "5260001246", "ul. Liściasta 3, 00-950 Warszawa",
                "14 dni", "[uzupełnij");
        assertThat(owner.post(base(t) + "/content/legal/TERMS", Map.of()).code()).isEqualTo("LEGAL_PAGE_EXISTS");
        String termsId = terms.json().get("id").asString();

        // Drafts are not public
        assertThat(sf(host, "/pages/regulamin").getStatus()).isEqualTo(404);

        // Published with template placeholders left → readiness says so
        var pub = owner.put(base(t) + "/content/" + termsId, entry("PAGE", "Regulamin sklepu", null, terms.json().get("body").asString(),
                "PUBLISHED", terms.json().get("version").asLong()));
        assertThat(pub.status()).as(pub.body()).isEqualTo(200);
        assertThat(pub.json().get("publishedRevision").asInt()).isEqualTo(1);
        assertThat(owner.get(base(t) + "/store/publish-readiness").json().get("missing").toString()).contains("[uzupełnij");

        // Saving identical text does not create a revision; changed text does
        var same = owner.put(base(t) + "/content/" + termsId, entry("PAGE", "Regulamin sklepu", null, terms.json().get("body").asString(),
                "PUBLISHED", pub.json().get("version").asLong()));
        assertThat(same.json().get("publishedRevision").asInt()).isEqualTo(1);
        String finalBody = terms.json().get("body").asString().replaceAll("\\[uzupełnij[^\\]]*\\]", "1 grudnia 2026 r.");
        var v2 = owner.put(base(t) + "/content/" + termsId, entry("PAGE", "Regulamin sklepu", null, finalBody, "PUBLISHED",
                same.json().get("version").asLong()));
        assertThat(v2.json().get("publishedRevision").asInt()).isEqualTo(2);
        // Stale version → conflict
        assertThat(owner.put(base(t) + "/content/" + termsId, entry("PAGE", "Regulamin sklepu", null, finalBody, "PUBLISHED",
                same.json().get("version").asLong())).status()).isEqualTo(409);

        publishLegalPages(owner, t); // privacy policy
        var published = owner.post(base(t) + "/store/publish", Map.of());
        assertThat(published.status()).as(published.body()).isEqualTo(200);

        // Public page, footer links
        JsonNode page = json(sf(host, "/pages/regulamin"));
        assertThat(page.get("title").asString()).isEqualTo("Regulamin sklepu");
        assertThat(page.get("systemKey").asString()).isEqualTo("TERMS");
        JsonNode store = json(sf(host, "/store"));
        assertThat(store.get("footerLinks").get(0).get("path").asString()).isEqualTo("/strona/regulamin");
        assertThat(store.get("footerLinks").get(1).get("systemKey").asString()).isEqualTo("PRIVACY");
        assertThat(store.get("blog").asBoolean()).isFalse();

        // While the store is open the terms cannot be withdrawn or deleted (but can be edited)
        long version = v2.json().get("version").asLong();
        assertThat(owner.put(base(t) + "/content/" + termsId, entry("PAGE", "Regulamin sklepu", null, finalBody, "DRAFT", version)).code())
                .isEqualTo("LEGAL_PAGE_REQUIRED");
        assertThat(owner.delete(base(t) + "/content/" + termsId).code()).isEqualTo("LEGAL_PAGE_REQUIRED");

        // The legal checklist in the panel
        JsonNode legal = owner.get(base(t) + "/content/legal").json();
        assertThat(legal.get(0).get("entry").get("status").asString()).isEqualTo("PUBLISHED");
        assertThat(legal.get(2).get("entry").isNull()).isTrue();

        // Another store sees none of it
        ApiClient other = registeredUser(uniqueEmail("legal-b"));
        String tb = createStore(other, "Inny", uniqueSlug("legal-b"));
        assertThat(other.get(base(tb) + "/content/" + termsId).status()).isEqualTo(404);
        assertThat(other.put(base(tb) + "/content/" + termsId, entry("PAGE", "x", null, "x", "DRAFT", 0)).status()).isEqualTo(404);
        assertThat(other.get(base(tb) + "/content?kind=PAGE").json().get("totalItems").asInt()).isZero();
        assertThat(other.get(base(t) + "/content?kind=PAGE").status()).isEqualTo(404); // not a member: the store is not revealed
    }

    @Test
    void blogPostsPagesSitemapAndRedirects() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("blog"));
        String slug = uniqueSlug("blog");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Blogowy", slug);
        sellable(owner, t);
        publishStore(owner, t);

        var draft = owner.post(base(t) + "/content", entry("POST", "Jak parzyć herbatę?", null, "## Woda\n\nNie wrzątek.", "DRAFT", 0));
        assertThat(draft.status()).as(draft.body()).isEqualTo(201);
        assertThat(draft.json().get("slug").asString()).isEqualTo("jak-parzyc-herbate");
        assertThat(json(sf(host, "/posts")).get("totalItems").asInt()).isZero();
        assertThat(sf(host, "/posts/jak-parzyc-herbate").getStatus()).isEqualTo(404);
        // Preview shows the draft
        String token = owner.post(base(t) + "/store/preview-token", Map.of()).json().get("token").asString();
        assertThat(mvc.perform(get("/api/v1/storefront/posts/jak-parzyc-herbate").header("Host", host).header("X-Store-Preview", token))
                .andReturn().getResponse().getStatus()).isEqualTo(200);

        String id = draft.json().get("id").asString();
        var live = owner.put(base(t) + "/content/" + id, entry("POST", "Jak parzyć herbatę?", null, "## Woda\n\nNie wrzątek.", "PUBLISHED",
                draft.json().get("version").asLong()));
        assertThat(live.status()).isEqualTo(200);
        JsonNode posts = json(sf(host, "/posts"));
        assertThat(posts.get("totalItems").asInt()).isEqualTo(1);
        assertThat(posts.get("items").get(0).get("excerpt").asString()).contains("Woda");
        assertThat(json(sf(host, "/store")).get("blog").asBoolean()).isTrue();
        assertThat(sf(host, "/sitemap.xml").getContentAsString()).contains("/blog/jak-parzyc-herbate", "/strona/regulamin", "/blog</loc>");

        // Changing the slug of a published post keeps the old address working (301 target)
        owner.put(base(t) + "/content/" + id, entry("POST", "Jak parzyć herbatę?", "parzenie-herbaty", "## Woda", "PUBLISHED",
                live.json().get("version").asLong()));
        assertThat(json(sf(host, "/redirect?path=/blog/jak-parzyc-herbate")).get("location").asString()).isEqualTo("/blog/parzenie-herbaty");

        // Same for products; chains are flattened
        String productId = owner.get(base(t) + "/products").json().get("items").get(0).get("id").asString();
        var product = owner.get(base(t) + "/products/" + productId).json();
        for (String newSlug : List.of("herbata-zielona-sencha", "sencha")) {
            Map<String, Object> in = jsonMapper.convertValue(product, Map.class);
            in.put("slug", newSlug);
            var saved = owner.put(base(t) + "/products/" + productId, in);
            assertThat(saved.status()).as(saved.body()).isEqualTo(200);
            product = saved.json();
        }
        assertThat(json(sf(host, "/redirect?path=/produkt/herbata-zielona")).get("location").asString()).isEqualTo("/produkt/sencha");
        assertThat(json(sf(host, "/redirect?path=/produkt/herbata-zielona-sencha")).get("location").asString()).isEqualTo("/produkt/sencha");

        // Manual redirects: only paths inside the store
        assertThat(owner.post(base(t) + "/redirects", Map.of("fromPath", "/stary-sklep/herbaty", "toPath", "https://evil.example/x")).status())
                .isEqualTo(201); // a full URL is reduced to its path → stays on the store
        assertThat(json(sf(host, "/redirect?path=/stary-sklep/herbaty")).get("location").asString()).isEqualTo("/x");
        assertThat(owner.post(base(t) + "/redirects", Map.of("fromPath", "//evil.example", "toPath", "/")).code()).isEqualTo("INVALID_PATH");
        assertThat(owner.post(base(t) + "/redirects", Map.of("fromPath", "/a", "toPath", "/a")).code()).isEqualTo("REDIRECT_LOOP");
        assertThat(owner.post(base(t) + "/redirects", Map.of("fromPath", "/stary-sklep/herbaty/", "toPath", "/y")).code()).isEqualTo("REDIRECT_EXISTS");
        assertThat(sf(host, "/redirect?path=/nic-tu-nie-ma").getStatus()).isEqualTo(404);
        assertThat(owner.get(base(t) + "/redirects").json().size()).isEqualTo(4);

        // Other stores do not see these redirects
        ApiClient other = registeredUser(uniqueEmail("blog-b"));
        String slugB = uniqueSlug("blog-b");
        String tb = createStore(other, "Inny", slugB);
        sellable(other, tb);
        publishStore(other, tb);
        assertThat(sf(slugB + ".shopivo.test", "/redirect?path=/stary-sklep/herbaty").getStatus()).isEqualTo(404);
        String redirectId = owner.get(base(t) + "/redirects").json().get(0).get("id").asString();
        assertThat(other.delete(base(tb) + "/redirects/" + redirectId).status()).isEqualTo(404);
    }
}

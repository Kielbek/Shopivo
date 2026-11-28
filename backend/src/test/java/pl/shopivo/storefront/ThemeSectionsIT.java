package pl.shopivo.storefront;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** Home-page sections, header / footer settings, the theme image library and category images. */
class ThemeSectionsIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    @Test
    void sectionsAreValidatedSavedAndImagesStayWithinTheStore() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("sekcje"));
        String t = createStore(owner, "Sekcje", uniqueSlug("sekcje"));
        var theme = owner.get(base(t) + "/theme").json();
        assertThat(theme.get("sectionTypes").size()).isEqualTo(12);
        assertThat(theme.get("presets").get(0).get("sections").get(0).get("type").asString()).isEqualTo("hero");

        var image = owner.upload(base(t) + "/theme/images", StorefrontIT.png(1600, 800), "baner.png", "image/png");
        assertThat(image.status()).as(image.body()).isEqualTo(201);
        String imageId = image.json().get("id").asString();
        assertThat(owner.get(base(t) + "/theme/images").json().size()).isEqualTo(1);

        String category = owner.post(base(t) + "/categories", Map.of("name", "Kubki", "visible", true, "version", 0)).json().get("id").asString();
        var withImage = owner.upload(base(t) + "/categories/" + category + "/image", StorefrontIT.png(800, 800), "k.png", "image/png");
        assertThat(withImage.status()).as(withImage.body()).isEqualTo(200);
        assertThat(withImage.json().get("image").get("w400").asString()).contains(t);
        var replaced = owner.upload(base(t) + "/categories/" + category + "/image", StorefrontIT.png(600, 600), "k2.png", "image/png");
        assertThat(replaced.status()).as(replaced.body()).isEqualTo(200);
        assertThat(owner.get(base(t) + "/categories").json().get(0).get("image").isObject()).isTrue();

        List<Map<String, Object>> sections = List.of(
                Map.of("id", "hero1", "type", "hero", "enabled", true, "data", Map.of("heading", "Lato", "image", imageId, "layout", "image", "link", "/kategoria/kubki")),
                Map.of("id", "faq1", "type", "faq", "enabled", true, "data", Map.of("items", List.of(Map.of("question", "Pytanie?", "answer", "Odpowiedź\ndruga linia")))),
                Map.of("id", "cat1", "type", "categories", "enabled", false, "data", Map.of("categories", List.of(category), "style", "tiles")));
        var saved = owner.put(base(t) + "/theme", Map.of("code", "VERA", "settings", Map.of("mobileNav", "bottom", "cartStyle", "page", "instagram", "https://instagram.com/sklep"),
                "sections", sections, "version", -1));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        var draft = saved.json().get("draft");
        assertThat(draft.get("sections").size()).isEqualTo(3);
        assertThat(draft.get("sections").get(0).get("data").get("height").asString()).isEqualTo("small");
        assertThat(draft.get("sections").get(1).get("data").get("items").get(0).get("answer").asString()).isEqualTo("Odpowiedź\ndruga linia");
        assertThat(draft.get("settings").get("mobileNav").asString()).isEqualTo("bottom");
        assertThat(draft.get("settings").get("cartStyle").asString()).as("cart as a separate page").isEqualTo("page");
        long v = saved.json().get("version").asLong();

        for (Object bad : List.of(
                List.of(Map.of("id", "x1x1", "type", "unknown", "enabled", true, "data", Map.of())),
                List.of(Map.of("id", "h1h1", "type", "hero", "enabled", true, "data", Map.of("hack", "x"))),
                List.of(Map.of("id", "h1h1", "type", "hero", "enabled", true, "data", Map.of("link", "javascript:alert(1)"))),
                List.of(Map.of("id", "h1h1", "type", "hero", "enabled", true, "data", Map.of("image", "not-an-id"))),
                List.of(Map.of("id", "h1h1", "type", "hero", "enabled", true, "data", Map.of()), Map.of("id", "h1h1", "type", "faq", "enabled", true, "data", Map.of())))) {
            assertThat(owner.put(base(t) + "/theme", Map.of("code", "VERA", "settings", Map.of(), "sections", bad, "version", v)).code())
                    .as(bad.toString()).isEqualTo("INVALID_THEME");
        }
        assertThat(owner.put(base(t) + "/theme", Map.of("code", "VERA", "settings", Map.of("instagram", "http://x.pl"), "version", v)).code())
                .isEqualTo("INVALID_THEME");
        assertThat(owner.put(base(t) + "/theme", Map.of("code", "VERA", "settings", Map.of("cartStyle", "popup"), "version", v)).code())
                .isEqualTo("INVALID_THEME");
        // Without the setting the cart is a side panel (default of both templates, also for configurations saved earlier)
        var fresh = owner.put(base(t) + "/theme", Map.of("code", "BAWILOO", "settings", Map.of(), "version", v));
        assertThat(fresh.json().get("draft").get("settings").get("cartStyle").asString()).isEqualTo("drawer");
        v = fresh.json().get("version").asLong();
        // Retired templates cannot be chosen any more
        assertThat(owner.put(base(t) + "/theme", Map.of("code", "FASHION", "settings", Map.of(), "version", v)).code()).isEqualTo("INVALID_THEME");

        ApiClient other = registeredUser(uniqueEmail("obcy"));
        String to = createStore(other, "Obcy", uniqueSlug("obcy"));
        assertThat(other.get(base(t) + "/theme/images").status()).isEqualTo(404);
        assertThat(other.delete(base(to) + "/theme/images/" + imageId).status()).isEqualTo(404);
        assertThat(other.upload(base(to) + "/categories/" + category + "/image", StorefrontIT.png(10, 10), "a.png", "image/png").status()).isEqualTo(404);
        assertThat(owner.get(base(t) + "/theme/images").json().size()).isEqualTo(1);

        assertThat(owner.delete(base(t) + "/theme/images/" + imageId).status()).isEqualTo(204);
        assertThat(owner.delete(base(t) + "/categories/" + category + "/image").status()).isEqualTo(204);
        assertThat(owner.get(base(t) + "/categories").json().get(0).get("image").isNull()).isTrue();
    }

    @Test
    void templateImagesAreSharedReferencesTheMerchantCanReplace() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("vera"));
        String slug = uniqueSlug("vera");
        String t = createStore(owner, "Vera", slug);
        var theme = owner.get(base(t) + "/theme").json();
        var vera = theme.get("presets").get(0);
        assertThat(vera.get("code").asString()).isEqualTo("VERA");
        assertThat(vera.get("defaults").get("font").asString()).isEqualTo("editorial");
        assertThat(vera.get("sections").get(0).get("data").get("image").asString()).isEqualTo("tpl:vera/hero");
        var assets = theme.get("templateImages");
        assertThat(assets.size()).isEqualTo(58);
        assertThat(theme.get("sampleProducts").get("VERA").size()).isEqualTo(8);
        assertThat(theme.get("sampleProducts").get("BAWILOO").size()).isEqualTo(16);
        assertThat(theme.get("sampleProducts").get("VELMIRA").size()).isEqualTo(4);
        assertThat(theme.get("sampleProducts").get("LULLORA").size()).isEqualTo(9);
        assertThat(theme.get("presets").get(1).get("code").asString()).isEqualTo("BAWILOO");
        assertThat(assets.get(0).get("urls").get("w1200").asString()).isEqualTo("/api/v1/theme-assets/vera/hero-w1200.jpg");

        // The template's own sections (with its images) are accepted as they are
        List<Object> sections = jsonMapper.convertValue(vera.get("sections"), List.class);
        var saved = owner.put(base(t) + "/theme", Map.of("code", "VERA", "settings", Map.of(), "sections", sections, "version", -1));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        long v = saved.json().get("version").asLong();
        assertThat(saved.json().get("draft").get("sections").get(1).get("data").get("items").get(0).get("image").asString()).isEqualTo("tpl:vera/women");

        // Unknown or malformed template references are rejected (sections and settings alike)
        for (String bad : List.of("tpl:vera/nope", "tpl:../../etc/passwd", "tpl:vera/hero-w400.jpg", "https://images.example.com/a.jpg")) {
            var r = owner.put(base(t) + "/theme", Map.of("code", "VERA", "settings", Map.of(), "version", v,
                    "sections", List.of(Map.of("id", "hero1", "type", "hero", "enabled", true, "data", Map.of("image", bad)))));
            assertThat(r.code()).as(bad).isEqualTo("INVALID_THEME");
            assertThat(owner.put(base(t) + "/theme", Map.of("code", "VERA", "settings", Map.of("logoImage", bad), "version", v)).code()).as(bad)
                    .isEqualTo("INVALID_THEME");
        }

        // The merchant swaps a template photo for their own one: just another id
        String own = owner.upload(base(t) + "/theme/images", StorefrontIT.png(1600, 800), "moje.png", "image/png").json().get("id").asString();
        var swapped = owner.put(base(t) + "/theme", Map.of("code", "VERA", "settings", Map.of(), "version", v,
                "sections", List.of(Map.of("id", "hero1", "type", "hero", "enabled", true, "data", Map.of("image", own, "layout", "editorial")),
                        Map.of("id", "banner1", "type", "banner", "enabled", true, "data", Map.of("image", "tpl:vera/atelier", "heading", "Pracownia")))));
        assertThat(swapped.status()).as(swapped.body()).isEqualTo(200);
        owner.post(base(t) + "/theme/publish", Map.of());

        // Storefront gets both kinds of images resolved
        var store = jsonMapper.readTree(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/storefront/store")
                .header("Host", slug + ".shopivo.test")).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(store.get("themeImages").get("tpl:vera/atelier").get("w400").asString()).isEqualTo("/api/v1/theme-assets/vera/atelier-w400.jpg");
        assertThat(store.get("themeImages").get(own).get("w1200").asString()).contains(t);

        // Files are public, cacheable JPEGs; only registered names are served
        var anon = client();
        var file = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/theme-assets/vera/hero-w400.jpg"))
                .andReturn().getResponse();
        assertThat(file.getStatus()).isEqualTo(200);
        assertThat(file.getContentType()).isEqualTo("image/jpeg");
        assertThat(file.getHeader("Cache-Control")).contains("max-age");
        assertThat(file.getContentAsByteArray().length).isGreaterThan(5_000);
        var webp = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/theme-assets/bawiloo/hero-w400.webp"))
                .andReturn().getResponse();
        assertThat(webp.getStatus()).isEqualTo(200);
        assertThat(webp.getContentType()).isEqualTo("image/webp");
        assertThat(anon.get("/api/v1/theme-assets/bawiloo/hero-w400.jpg").status()).as("only the registered format").isEqualTo(404);
        assertThat(anon.get("/api/v1/theme-assets/vera/secret-w400.jpg").status()).isEqualTo(404);
        assertThat(anon.get("/api/v1/theme-assets/other/hero-w400.jpg").status()).isEqualTo(404);
        assertThat(anon.get("/api/v1/theme-assets/vera/..%2F..%2Fapplication.yml").status()).isIn(400, 404);
    }

    @Test
    void templateSampleProductsArePreviewOnlyUntilTheMerchantAddsThem() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("probki"));
        String slug = uniqueSlug("probki");
        String t = createStore(owner, "Próbki", slug);
        var store = jsonMapper.readTree(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/storefront/store")
                .header("Host", slug + ".shopivo.test")).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(store.has("sampleProducts")).as("the store shows only its own products").isFalse();

        // Template demo: the template's example catalogue, no store involved; buying is switched off
        var demo = jsonMapper.readTree(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/storefront/demo/BAWILOO/store"))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(demo.get("theme").get("code").asString()).isEqualTo("BAWILOO");
        assertThat(demo.get("categories").size()).isEqualTo(6);
        var demoProducts = jsonMapper.readTree(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/storefront/demo/BAWILOO/products?size=48"))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(demoProducts.get("totalItems").asInt()).isEqualTo(16);
        var pingwin = jsonMapper.readTree(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/storefront/demo/BAWILOO/products/pingwin-lotek"))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(pingwin.get("images").get(0).get("urls").get("w1200").asString()).startsWith("/api/v1/theme-assets/bawiloo/");
        assertThat(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/storefront/demo/BAWILOO/cart"))
                .andReturn().getResponse().getStatus()).isEqualTo(409);
        assertThat(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/storefront/demo/NOPE/store"))
                .andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(owner.get(base(t) + "/theme").json().get("usage").isObject()).isTrue();

        var first = owner.post(base(t) + "/theme/sample-products", Map.of("code", "VERA"));
        assertThat(first.status()).as(first.body()).isEqualTo(200);
        assertThat(first.json().get("created").asInt()).isEqualTo(8);
        assertThat(owner.post(base(t) + "/theme/sample-products", Map.of("code", "VERA")).json().get("created").asInt()).as("repeatable").isZero();
        assertThat(owner.post(base(t) + "/theme/sample-products", Map.of("code", "VOLT")).code()).isEqualTo("NO_SAMPLES");

        var products = owner.get(base(t) + "/products?size=50").json();
        assertThat(products.get("totalElements") != null ? products.get("totalElements").asInt() : products.get("totalItems").asInt()).isEqualTo(8);
        var cats = owner.get(base(t) + "/categories").json();
        assertThat(cats.size()).isEqualTo(3);
        String coatId = null;
        for (var p : products.get("content") != null ? products.get("content") : products.get("items")) {
            if (p.get("name").asString().equals("Płaszcz wełniany Oslo")) coatId = p.get("id").asString();
        }
        var coat = owner.get(base(t) + "/products/" + coatId).json();
        assertThat(coat.get("status").asString()).isEqualTo("ACTIVE");
        assertThat(coat.get("variants").size()).isEqualTo(5);
        assertThat(coat.get("images").size()).isEqualTo(1);
        assertThat(coat.get("images").get(0).get("urls").get("w400").asString()).contains(t);

        // The toy template: its sections are accepted and its 16 example products can be added too
        var bawiloo = owner.get(base(t) + "/theme").json().get("presets").get(1);
        List<Object> bSections = jsonMapper.convertValue(bawiloo.get("sections"), List.class);
        long v = owner.get(base(t) + "/theme").json().get("state").get("version").asLong();
        var savedB = owner.put(base(t) + "/theme", Map.of("code", "BAWILOO", "settings", Map.of(), "sections", bSections, "version", v));
        assertThat(savedB.status()).as(savedB.body()).isEqualTo(200);
        // The gallery counts stores per template (an aggregate only)
        assertThat(owner.get(base(t) + "/theme").json().get("usage").get("BAWILOO").asLong()).isPositive();
        assertThat(owner.post(base(t) + "/theme/sample-products", Map.of("code", "BAWILOO")).json().get("created").asInt()).isEqualTo(16);
        // its six categories come with the template's pictures
        var allCats = owner.get(base(t) + "/categories").json();
        assertThat(allCats.size()).isEqualTo(9);
        for (var c : allCats) assertThat(c.get("image").isObject()).as(c.get("name").asString()).isTrue();

        ApiClient other = registeredUser(uniqueEmail("obcy2"));
        assertThat(other.post(base(t) + "/theme/sample-products", Map.of("code", "VERA")).status()).isEqualTo(404);
    }
}

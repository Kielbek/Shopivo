package pl.shopivo.themes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

class TemplateDocsIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    private MockHttpServletResponse sf(String host, String path, String preview) throws Exception {
        var b = get("/api/v1/storefront" + path).header("Host", host);
        if (preview != null) b.header("X-Store-Preview", preview);
        return mvc.perform(b).andReturn().getResponse();
    }

    private JsonNode body(MockHttpServletResponse r) throws Exception {
        return jsonMapper.readTree(r.getContentAsString());
    }

    /** The template's default home page, as the editor starts from it. */
    private ObjectNode defaultHome(JsonNode template) {
        return (ObjectNode) template.get("defaults").get("index").deepCopy();
    }

    @Test
    void draftIsValidatedPreviewedPublishedAndRestorable() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("szablon"));
        String slug = uniqueSlug("szablon");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Szablon", slug);
        var theme = owner.get(base(t) + "/theme").json();
        owner.put(base(t) + "/theme", Map.of("code", "BAWILOO", "settings", Map.of(), "version", theme.get("state").get("version").asLong()));

        var template = owner.get(base(t) + "/template");
        assertThat(template.status()).as(template.body()).isEqualTo(200);
        JsonNode tpl = template.json();
        assertThat(tpl.get("code").asString()).isEqualTo("BAWILOO");
        assertThat(tpl.get("sections").has("hero")).isTrue();
        assertThat(tpl.get("sections").get("hero").get("settings").get(0).get("id").asString()).isEqualTo("heading");
        assertThat(tpl.get("defaults").get("index").get("order").size()).isEqualTo(7);
        assertThat(tpl.get("state").get("version").asLong()).isEqualTo(-1);

        // Edit the home page: new heading, "O nas" first, newsletter hidden, a fifth benefit
        ObjectNode home = defaultHome(tpl);
        ((ObjectNode) home.get("sections").get("hero").get("settings")).put("heading", "Nowy\nnapis");
        var order = (tools.jackson.databind.node.ArrayNode) home.get("order");
        order.remove(5);
        order.insert(0, "about");
        ((ObjectNode) home.get("sections").get("newsletter")).put("disabled", true);
        ObjectNode benefits = (ObjectNode) home.get("sections").get("benefits");
        ((ObjectNode) benefits.get("blocks")).putObject("benefit-5").put("type", "benefit").putObject("settings").put("title", "PREZENTY");
        ((tools.jackson.databind.node.ArrayNode) benefits.get("block_order")).add("benefit-5");
        var saved = owner.put(base(t) + "/template/draft", Map.of("doc", Map.of("pages", Map.of("index", home)), "version", -1));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        long v = saved.json().get("version").asLong();
        assertThat(saved.json().get("unpublishedChanges").asBoolean()).isTrue();

        // Visitors see nothing of the draft; the preview token shows it
        String token = owner.post(base(t) + "/store/preview-token", Map.of()).json().get("token").asString();
        assertThat(body(sf(host, "/template", null)).get("doc").size()).isZero();
        JsonNode preview = body(sf(host, "/template", token));
        assertThat(preview.get("code").asString()).isEqualTo("BAWILOO");
        assertThat(preview.get("doc").get("pages").get("index").get("order").get(0).asString()).isEqualTo("about");
        assertThat(sf(host, "/template", token).getHeader("Cache-Control")).contains("no-store");

        // Rejected: unknown sections, a page losing its own section, unsafe links, foreign images, unknown settings…
        for (Object bad : List.of(
                Map.of("pages", Map.of("index", Map.of("sections", Map.of("x", Map.of("type", "nie-ma")), "order", List.of("x")))),
                Map.of("pages", Map.of("product", Map.of("sections", Map.of(), "order", List.of()))),
                Map.of("pages", Map.of("index", Map.of("sections", Map.of("h", Map.of("type", "header")), "order", List.of("h")))),
                Map.of("pages", Map.of("index", Map.of("sections", Map.of("h", Map.of("type", "hero", "settings", Map.of("button_url", "javascript:alert(1)"))), "order", List.of("h")))),
                Map.of("pages", Map.of("index", Map.of("sections", Map.of("h", Map.of("type", "hero", "settings", Map.of("image", "8f6c3f0e-1111-4111-8111-111111111111"))), "order", List.of("h")))),
                Map.of("pages", Map.of("index", Map.of("sections", Map.of("h", Map.of("type", "hero", "settings", Map.of("hack", "x"))), "order", List.of("h")))),
                Map.of("pages", Map.of("index", Map.of("sections", Map.of("h", Map.of("type", "hero")), "order", List.of()))),
                Map.of("pages", Map.of("index", Map.of("sections", Map.of("f", Map.of("type", "featured-products", "settings",
                        Map.of("products", Map.of("source", "category", "count", 6)))), "order", List.of("f")))),
                Map.of("groups", Map.of("header", Map.of("sections", Map.of(), "order", List.of()))),
                Map.of("pages", Map.of("nie-ma", Map.of("sections", Map.of(), "order", List.of()))))) {
            var r = owner.put(base(t) + "/template/draft", Map.of("doc", bad, "version", v));
            assertThat(r.code()).as(bad.toString()).isEqualTo("INVALID_TEMPLATE_DOC");
        }
        // An image from the store's library is accepted
        String imageId = owner.upload(base(t) + "/theme/images", pl.shopivo.storefront.StorefrontIT.png(800, 400), "baner.png", "image/png")
                .json().get("id").asString();
        ((ObjectNode) home.get("sections").get("hero").get("settings")).put("image", imageId);
        var withImage = owner.put(base(t) + "/template/draft", Map.of("doc", Map.of("pages", Map.of("index", home)), "version", v));
        assertThat(withImage.status()).as(withImage.body()).isEqualTo(200);
        v = withImage.json().get("version").asLong();
        // Stale version: conflict, nothing lost
        assertThat(owner.put(base(t) + "/template/draft", Map.of("doc", Map.of(), "version", v - 1)).code()).isEqualTo("VERSION_CONFLICT");

        // Publish → visitors see it, the version is kept
        var published = owner.post(base(t) + "/template/publish", Map.of());
        assertThat(published.status()).as(published.body()).isEqualTo(200);
        assertThat(published.json().get("unpublishedChanges").asBoolean()).isFalse();
        assertThat(body(sf(host, "/template", null)).get("doc").get("pages").get("index").get("sections").get("hero").get("settings")
                .get("heading").asString()).isEqualTo("Nowy\nnapis");
        v = published.json().get("version").asLong();

        // Another change and publication; then the first look comes back as the draft
        var changed = owner.put(base(t) + "/template/draft", Map.of("doc", Map.of(), "version", v));
        v = changed.json().get("version").asLong();
        owner.post(base(t) + "/template/publish", Map.of());
        var versions = owner.get(base(t) + "/template").json().get("versions");
        assertThat(versions.size()).isEqualTo(2);
        long current = owner.get(base(t) + "/template").json().get("state").get("version").asLong();
        var restored = owner.post(base(t) + "/template/versions/" + versions.get(1).get("id").asString() + "/restore", Map.of("version", current));
        assertThat(restored.status()).as(restored.body()).isEqualTo(200);
        assertThat(restored.json().get("draft").get("pages").get("index").get("order").get(0).asString()).isEqualTo("about");
        assertThat(restored.json().get("unpublishedChanges").asBoolean()).isTrue();

        // Another store sees none of it
        ApiClient other = registeredUser(uniqueEmail("obcy"));
        createStore(other, "Obcy", uniqueSlug("obcy"));
        assertThat(other.get(base(t) + "/template").status()).isEqualTo(404);
        assertThat(other.put(base(t) + "/template/draft", Map.of("doc", Map.of(), "version", 0)).status()).isEqualTo(404);
    }

    /** Prices on the Nordivo photo: points in percent, rounded to 0.1; an optional phone point may be null. */
    @Test
    void pointsOnAPictureAreValidatedAndRounded() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("nordivo"));
        String t = createStore(owner, "Nordivo", uniqueSlug("nordivo"));
        var theme = owner.get(base(t) + "/theme").json();
        owner.put(base(t) + "/theme", Map.of("code", "NORDIVO", "settings", Map.of(), "version", theme.get("state").get("version").asLong()));
        java.util.function.Function<Object, Map<String, Object>> home = (mobile) -> {
            Map<String, Object> settings = new java.util.HashMap<>(Map.of("product", "komoda-rustic", "position", Map.of("x", 33.333, "y", 12)));
            settings.put("position_mobile", mobile);
            return Map.of("pages", Map.of("index", Map.of("order", List.of("hero"), "sections", Map.of("hero", Map.of("type", "hero", "settings", Map.of(),
                    "blocks", Map.of("hotspot-1", Map.of("type", "hotspot", "settings", settings)), "block_order", List.of("hotspot-1"))))));
        };
        var saved = owner.put(base(t) + "/template/draft", Map.of("doc", home.apply(null), "version", -1));
        assertThat(saved.status()).isEqualTo(200);
        var s = saved.json().get("draft").get("pages").get("index").get("sections").get("hero").get("blocks").get("hotspot-1").get("settings");
        assertThat(s.get("position").get("x").asDouble()).isEqualTo(33.3);
        assertThat(s.get("position_mobile").isNull()).isTrue();
        long v = saved.json().get("version").asLong();
        assertThat(owner.put(base(t) + "/template/draft", Map.of("doc", home.apply(Map.of("x", 120, "y", 5)), "version", v)).code())
                .isEqualTo("INVALID_TEMPLATE_DOC");
        assertThat(owner.put(base(t) + "/template/draft", Map.of("doc", home.apply("środek"), "version", v)).code())
                .isEqualTo("INVALID_TEMPLATE_DOC");
    }

    @Test
    void templatesOfTheOldEngineHaveNoDocument() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("vera"));
        String t = createStore(owner, "Vera", uniqueSlug("vera"));
        assertThat(owner.get(base(t) + "/template").code()).isEqualTo("NOT_A_TEMPLATE_PACKAGE");
    }
}

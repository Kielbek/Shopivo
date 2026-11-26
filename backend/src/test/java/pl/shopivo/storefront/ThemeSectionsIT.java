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
        assertThat(theme.get("sectionTypes").size()).isEqualTo(10);
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
        var saved = owner.put(base(t) + "/theme", Map.of("code", "FASHION", "settings", Map.of("mobileNav", "bottom", "instagram", "https://instagram.com/sklep"),
                "sections", sections, "version", -1));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        var draft = saved.json().get("draft");
        assertThat(draft.get("sections").size()).isEqualTo(3);
        assertThat(draft.get("sections").get(0).get("data").get("height").asString()).isEqualTo("small");
        assertThat(draft.get("sections").get(1).get("data").get("items").get(0).get("answer").asString()).isEqualTo("Odpowiedź\ndruga linia");
        assertThat(draft.get("settings").get("mobileNav").asString()).isEqualTo("bottom");
        long v = saved.json().get("version").asLong();

        for (Object bad : List.of(
                List.of(Map.of("id", "x1x1", "type", "unknown", "enabled", true, "data", Map.of())),
                List.of(Map.of("id", "h1h1", "type", "hero", "enabled", true, "data", Map.of("hack", "x"))),
                List.of(Map.of("id", "h1h1", "type", "hero", "enabled", true, "data", Map.of("link", "javascript:alert(1)"))),
                List.of(Map.of("id", "h1h1", "type", "hero", "enabled", true, "data", Map.of("image", "not-an-id"))),
                List.of(Map.of("id", "h1h1", "type", "hero", "enabled", true, "data", Map.of()), Map.of("id", "h1h1", "type", "faq", "enabled", true, "data", Map.of())))) {
            assertThat(owner.put(base(t) + "/theme", Map.of("code", "FASHION", "settings", Map.of(), "sections", bad, "version", v)).code())
                    .as(bad.toString()).isEqualTo("INVALID_THEME");
        }
        assertThat(owner.put(base(t) + "/theme", Map.of("code", "FASHION", "settings", Map.of("instagram", "http://x.pl"), "version", v)).code())
                .isEqualTo("INVALID_THEME");

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
}

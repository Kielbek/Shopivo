package pl.shopivo.storefront;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

public class StorefrontIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    private MockHttpServletResponse sf(String host, String path, String preview) throws Exception {
        var b = get("/api/v1/storefront" + path).header("Host", host);
        if (preview != null) b.header("X-Store-Preview", preview);
        return mvc.perform(b).andReturn().getResponse();
    }

    private JsonNode json(MockHttpServletResponse r) throws Exception {
        return jsonMapper.readTree(r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    private static Map<String, Object> product(String name, String status, String sku, long price, int stock, List<String> categories) {
        Map<String, Object> v = new HashMap<>();
        v.put("optionValues", Map.of());
        v.put("sku", sku);
        v.put("priceMinor", price);
        v.put("trackInventory", true);
        v.put("allowBackorder", false);
        v.put("initialStock", stock);
        Map<String, Object> p = new HashMap<>();
        p.put("name", name);
        p.put("status", status);
        p.put("description", "Opis " + name);
        p.put("categoryIds", categories);
        p.put("variants", List.of(v));
        p.put("version", 0);
        return p;
    }

    public static byte[] png(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        var g = img.createGraphics();
        g.setColor(new Color(90, 141, 239));
        g.fillRect(0, 0, w / 2, h);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    @Test
    void publishedStoreServesCatalogueThemeAndSeo() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("sf"));
        String slug = uniqueSlug("sf");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Sklep Publiczny", slug);

        // Draft store: only the "coming soon" info, no catalogue, no cart
        JsonNode draft = json(sf(host, "/store", null));
        assertThat(draft.get("open").asBoolean()).isFalse();
        assertThat(draft.get("categories").size()).isZero();
        assertThat(draft.get("seller").isNull()).as("seller data is not public before publication").isTrue();
        var closed = sf(host, "/products", null);
        assertThat(closed.getStatus()).isEqualTo(404);
        assertThat(json(closed).get("code").asString()).isEqualTo("STORE_NOT_PUBLISHED");
        assertThat(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/storefront/cart")
                .header("Host", host)).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(sf(host, "/robots.txt", null).getContentAsString()).contains("Disallow: /");

        // Readiness lists what is missing
        var readiness = owner.get(base(t) + "/store/publish-readiness").json();
        assertThat(readiness.get("ready").asBoolean()).isFalse();
        assertThat(readiness.get("missing").toString()).contains("dane firmy", "produkt", "dostawy", "płatności");
        assertThat(owner.post(base(t) + "/store/publish", Map.of()).code()).isEqualTo("PUBLISH_NOT_READY");

        // Catalogue
        String root = owner.post(base(t) + "/categories", Map.of("name", "Ceramika", "visible", true, "version", 0)).json().get("id").asString();
        String mugs = owner.post(base(t) + "/categories", Map.of("name", "Kubki", "parentId", root, "visible", true, "version", 0)).json().get("id").asString();
        String hidden = owner.post(base(t) + "/categories", Map.of("name", "Ukryta", "visible", false, "version", 0)).json().get("id").asString();
        var mug = owner.post(base(t) + "/products", product("Kubek Glina", "ACTIVE", "KUB-1", 5900, 2, List.of(mugs))).json();
        owner.post(base(t) + "/products", product("Talerz Biały", "ACTIVE", "TAL-1", 3900, 0, List.of(root)));
        owner.post(base(t) + "/products", product("Szkic Wazon", "DRAFT", "WAZ-1", 9900, 5, List.of(root)));
        owner.post(base(t) + "/shipping-methods", Map.of("name", "Kurier", "type", "COURIER", "priceMinor", 1500, "active", true, "version", 0));
        owner.put(base(t) + "/payment-settings", Map.of("bankTransferEnabled", false, "codEnabled", true, "codFeeMinor", 0,
                "unpaidCancelDays", 7, "version", -1));

        // Image upload: validated, resized, served from the media endpoint
        String productId = mug.get("id").asString();
        assertThat(owner.upload(base(t) + "/products/" + productId + "/images", "to nie jest obraz".getBytes(), "x.png", "image/png").code())
                .isEqualTo("UNSUPPORTED_IMAGE");
        assertThat(owner.upload(base(t) + "/products/" + productId + "/images", png(9000, 4), "wide.png", "image/png").code())
                .isEqualTo("IMAGE_TOO_LARGE");
        var image = owner.upload(base(t) + "/products/" + productId + "/images", png(1600, 1200), "kubek.png", "image/png");
        assertThat(image.status()).as(image.body()).isEqualTo(201);
        String url400 = image.json().get("urls").get("w400").asString();
        var served = mvc.perform(get(url400)).andReturn().getResponse();
        assertThat(served.getStatus()).isEqualTo(200);
        // The test picture is half transparent: it keeps its transparency (PNG variants), see ImageProcessorTest
        assertThat(url400).endsWith("/w400.png");
        assertThat(served.getContentType()).isEqualTo("image/png");
        assertThat(served.getHeader("Cache-Control")).contains("max-age=31536000").contains("immutable");
        BufferedImage variant = ImageIO.read(new java.io.ByteArrayInputStream(served.getContentAsByteArray()));
        assertThat(variant.getWidth()).isEqualTo(400);
        assertThat(variant.getHeight()).isEqualTo(300);

        publishStore(owner, t);
        JsonNode store = json(sf(host, "/store", null));
        assertThat(store.get("open").asBoolean()).isTrue();
        assertThat(store.get("theme").get("code").asString()).isEqualTo("VERA");
        assertThat(store.get("seller").get("taxId").asString()).isEqualTo("5260001246");
        assertThat(store.get("categories").toString()).contains("Kubki").doesNotContain("Ukryta");

        JsonNode list = json(sf(host, "/products?kategoria=ceramika&sort=PRICE_ASC", null));
        assertThat(list.get("totalItems").asInt()).isEqualTo(2); // subcategory included, draft excluded
        assertThat(list.get("items").get(0).get("name").asString()).isEqualTo("Talerz Biały");
        assertThat(list.get("items").get(0).get("available").asBoolean()).isFalse();
        assertThat(list.get("items").get(1).get("imageUrl").asString()).isEqualTo(url400);
        assertThat(json(sf(host, "/products?q=kubek", null)).get("totalItems").asInt()).isEqualTo(1);
        assertThat(sf(host, "/products?kategoria=ukryta", null).getStatus()).isEqualTo(404);

        JsonNode detail = json(sf(host, "/products/kubek-glina", null));
        assertThat(detail.get("variants").get(0).get("available").asBoolean()).isTrue();
        assertThat(detail.get("variants").get(0).get("lowStock").asBoolean()).isTrue();
        assertThat(detail.get("variants").get(0).has("onHand")).isFalse();
        assertThat(detail.get("breadcrumbs").toString()).contains("Ceramika", "Kubki");
        assertThat(detail.get("images").size()).isEqualTo(1);
        assertThat(sf(host, "/products/szkic-wazon", null).getStatus()).isEqualTo(404);

        // Prices entered net are shown gross
        var settings = owner.get(base(t) + "/store/settings").json();
        Map<String, Object> net = new HashMap<>(jsonMapper.convertValue(settings, Map.class));
        net.put("pricesIncludeTax", false);
        assertThat(owner.put(base(t) + "/store/settings", net).status()).isEqualTo(200);
        assertThat(json(sf(host, "/products/kubek-glina", null)).get("variants").get(0).get("priceMinor").asLong()).isEqualTo(7257);

        String sitemap = sf(host, "/sitemap.xml", null).getContentAsString();
        assertThat(sitemap).contains("<loc>https://" + host + "/produkt/kubek-glina</loc>").contains("/kategoria/kubki").doesNotContain("szkic-wazon");
        assertThat(sf(host, "/robots.txt", null).getContentAsString()).contains("Sitemap:").contains("Disallow: /koszyk");

        // Deleting the image removes the files
        owner.delete(base(t) + "/products/" + productId + "/images/" + image.json().get("id").asString());
        assertThat(mvc.perform(get(url400)).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void themeDraftIsVisibleOnlyInSignedPreview() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("theme"));
        String slug = uniqueSlug("theme");
        String host = slug + ".shopivo.test";
        String t = createStore(owner, "Sklep Motywów", slug);
        owner.post(base(t) + "/products", product("Produkt", "ACTIVE", "P-1", 1000, 1, List.of()));

        var theme = owner.get(base(t) + "/theme").json();
        assertThat(theme.get("presets").size()).isEqualTo(3);
        assertThat(owner.put(base(t) + "/theme", Map.of("code", "BAWILOO", "settings", Map.of("primary", "red"), "version", -1)).code())
                .isEqualTo("INVALID_THEME");
        assertThat(owner.put(base(t) + "/theme", Map.of("code", "BAWILOO", "settings", Map.of("hack", "x"), "version", -1)).code())
                .isEqualTo("INVALID_THEME");
        var saved = owner.put(base(t) + "/theme", Map.of("code", "BAWILOO", "settings", Map.of("primary", "#7a5f30",
                "heroTitle", "Złoto i srebro"), "version", -1));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        assertThat(saved.json().get("draft").get("settings").get("primary").asString()).isEqualTo("#7A5F30");
        assertThat(saved.json().get("unpublishedChanges").asBoolean()).isTrue();

        String token = owner.post(base(t) + "/store/preview-token", Map.of()).json().get("token").asString();
        // Unpublished store: catalogue only with a valid preview token for this store
        assertThat(sf(host, "/products", null).getStatus()).isEqualTo(404);
        assertThat(sf(host, "/products", token).getStatus()).isEqualTo(200);
        assertThat(sf(host, "/products", token + "x").getStatus()).isEqualTo(404);
        JsonNode previewStore = json(sf(host, "/store", token));
        assertThat(previewStore.get("preview").asBoolean()).isTrue();
        assertThat(previewStore.get("theme").get("code").asString()).isEqualTo("BAWILOO");
        assertThat(sf(host, "/store", token).getHeader("Cache-Control")).contains("no-store");
        // Public visitors still see the published (default) theme
        assertThat(json(sf(host, "/store", null)).get("theme").get("code").asString()).isEqualTo("VERA");

        owner.post(base(t) + "/theme/publish", Map.of());
        // The old single-banner setting lands in the hero section; the storefront gets the sections and theme images
        JsonNode published = json(sf(host, "/store", null));
        assertThat(published.get("theme").get("sections").get(0).get("type").asString()).isEqualTo("hero");
        assertThat(published.get("theme").get("sections").get(0).get("data").get("heading").asString()).isEqualTo("Złoto i srebro");
        assertThat(published.get("theme").get("settings").has("heroTitle")).isFalse();
        assertThat(published.get("themeImages").isObject()).isTrue();

        // A token of one store does not open another
        ApiClient other = registeredUser(uniqueEmail("theme-b"));
        String slugB = uniqueSlug("theme-b");
        createStore(other, "Inny", slugB);
        assertThat(sf(slugB + ".shopivo.test", "/products", token).getStatus()).isEqualTo(404);
        // ...and another store cannot upload images to this store's products
        String foreignProduct = owner.get(base(t) + "/products").json().get("items").get(0).get("id").asString();
        String tb = other.get("/api/v1/stores").json().get(0).get("tenantId").asString();
        assertThat(other.upload(base(tb) + "/products/" + foreignProduct + "/images", png(10, 10), "a.png", "image/png").status())
                .isEqualTo(404);
    }

    @Test
    void storageLimitOfThePlanIsEnforced() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("quota"));
        String t = createStore(owner, "Sklep Limit", uniqueSlug("quota"));
        String p = owner.post(base(t) + "/products", product("P", "ACTIVE", "Q-1", 100, 1, List.of())).json().get("id").asString();
        ApiClient admin = login("admin@shopivo.test", "Platforma!Testowa-2026");
        admin.put("/api/v1/admin/subscriptions/" + t + "/overrides/storage.max_mb", Map.of("value", "0", "reason", "test"));
        var refused = owner.upload(base(t) + "/products/" + p + "/images", png(50, 50), "a.png", "image/png");
        assertThat(refused.status()).isEqualTo(402);
        assertThat(refused.code()).isEqualTo("ENTITLEMENT_LIMIT");
        // Files written before the refused transaction are removed again (no orphans counted against nobody).
        java.nio.file.Path dir = java.nio.file.Path.of(System.getProperty("java.io.tmpdir"), "shopivo-test-media", "t", t);
        try (var files = java.nio.file.Files.exists(dir) ? java.nio.file.Files.walk(dir) : java.util.stream.Stream.<java.nio.file.Path>empty()) {
            assertThat(files.filter(java.nio.file.Files::isRegularFile).toList()).isEmpty();
        }
    }

    @Test
    void concurrentUploadsCannotExceedTheImageLimitAndThemeSavesAreCompareAndSet() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("race"));
        String t = createStore(owner, "Sklep Wyścig", uniqueSlug("race"));
        String p = owner.post(base(t) + "/products", product("P", "ACTIVE", "R-1", 100, 1, List.of())).json().get("id").asString();
        byte[] img = png(40, 40);
        var pool = java.util.concurrent.Executors.newFixedThreadPool(8);
        try {
            List<java.util.concurrent.Future<Integer>> results = new java.util.ArrayList<>();
            for (int i = 0; i < 14; i++) {
                results.add(pool.submit(() -> owner.upload(base(t) + "/products/" + p + "/images", img, "a.png", "image/png").status()));
            }
            int created = 0;
            for (var r : results) if (r.get() == 201) created++;
            assertThat(created).isEqualTo(10);
        } finally {
            pool.shutdown();
        }
        JsonNode images = owner.get(base(t) + "/products/" + p).json().get("images");
        assertThat(images.size()).isEqualTo(10);
        List<Integer> positions = new java.util.ArrayList<>();
        images.forEach(i -> positions.add(i.get("position").asInt()));
        assertThat(positions).containsExactlyInAnyOrder(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);

        var first = owner.put(base(t) + "/theme", Map.of("code", "VERA", "settings", Map.of(), "version", -1));
        assertThat(first.status()).isEqualTo(200);
        assertThat(owner.put(base(t) + "/theme", Map.of("code", "BAWILOO", "settings", Map.of(), "version", -1)).status()).isEqualTo(409);
        long v = first.json().get("version").asLong();
        assertThat(owner.put(base(t) + "/theme", Map.of("code", "BAWILOO", "settings", Map.of(), "version", v)).status()).isEqualTo(200);
        assertThat(owner.put(base(t) + "/theme", Map.of("code", "BAWILOO", "settings", Map.of(), "version", v)).status()).isEqualTo(409);
    }
}

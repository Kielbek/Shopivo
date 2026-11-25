package pl.shopivo.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

class CatalogIT extends IntegrationTest {

    private static Map<String, Object> variant(Map<String, String> options, String sku, long price, Integer stock) {
        Map<String, Object> v = new HashMap<>();
        v.put("optionValues", options);
        v.put("sku", sku);
        v.put("priceMinor", price);
        v.put("trackInventory", true);
        v.put("allowBackorder", false);
        v.put("initialStock", stock);
        return v;
    }

    private static Map<String, Object> simpleProduct(String name, String sku, long price, int stock) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name);
        p.put("status", "ACTIVE");
        p.put("variants", List.of(variant(Map.of(), sku, price, stock)));
        p.put("version", 0);
        return p;
    }

    private static String base(String tenant) {
        return "/api/v1/tenants/" + tenant;
    }

    @Test
    void productsWithVariantsCategoriesInventoryAndOmnibus() {
        ApiClient owner = registeredUser(uniqueEmail("catalog"));
        String t = createStore(owner, "Sklep z Odzieżą", uniqueSlug("odziez"));

        // Category tree
        var root = owner.post(base(t) + "/categories", Map.of("name", "Odzież", "visible", true, "version", 0));
        assertThat(root.status()).as(root.body()).isEqualTo(201);
        String rootId = root.json().get("id").asString();
        var child = owner.post(base(t) + "/categories", Map.of("name", "Koszulki", "parentId", rootId, "visible", true, "version", 0));
        String childId = child.json().get("id").asString();
        assertThat(child.json().get("depth").asInt()).isEqualTo(1);
        var cycle = owner.put(base(t) + "/categories/" + rootId, Map.of("name", "Odzież", "parentId", childId, "visible", true,
                "version", root.json().get("version").asLong()));
        assertThat(cycle.code()).isEqualTo("CATEGORY_CYCLE");
        assertThat(owner.delete(base(t) + "/categories/" + rootId).code()).isEqualTo("CATEGORY_HAS_CHILDREN");
        String brandId = owner.post(base(t) + "/brands", Map.of("name", "Łódzka Manufaktura")).json().get("id").asString();

        // Product with two options and variants
        Map<String, Object> product = new HashMap<>();
        product.put("name", "Koszulka Łódź");
        product.put("description", "Bawełna organiczna.");
        product.put("status", "ACTIVE");
        product.put("vatRateBps", 2300);
        product.put("brandId", brandId);
        product.put("categoryIds", List.of(childId));
        product.put("options", List.of(Map.of("name", "Rozmiar", "values", List.of("S", "M")), Map.of("name", "Kolor", "values", List.of("Biały"))));
        product.put("variants", List.of(variant(Map.of("Rozmiar", "S", "Kolor", "Biały"), "KOS-S", 7900, 4),
                variant(Map.of("rozmiar", "m", "kolor", "biały"), "KOS-M", 7900, 10)));
        product.put("version", 0);
        var created = owner.post(base(t) + "/products", product);
        assertThat(created.status()).as(created.body()).isEqualTo(201);
        JsonNode p = created.json();
        String productId = p.get("id").asString();
        assertThat(p.get("slug").asString()).isEqualTo("koszulka-lodz");
        assertThat(p.get("variants").size()).isEqualTo(2);
        assertThat(p.get("variants").get(1).get("title").asString()).isEqualTo("M / Biały");
        assertThat(p.get("variants").get(0).get("onHand").asInt()).isEqualTo(4);
        assertThat(p.get("brand").get("name").asString()).isEqualTo("Łódzka Manufaktura");
        assertThat(p.get("publishedAt").isNull()).isFalse();

        // Search by SKU and by parent category (includes sub-categories)
        assertThat(owner.get(base(t) + "/products?q=kos-m").json().get("totalItems").asInt()).isEqualTo(1);
        var byCategory = owner.get(base(t) + "/products?categoryId=" + rootId).json().get("items");
        assertThat(byCategory.size()).isEqualTo(1);
        assertThat(byCategory.get(0).get("stock").asInt()).isEqualTo(14);
        assertThat(byCategory.get(0).get("categories").get(0).asString()).isEqualTo("Koszulki");

        // Validation
        assertThat(owner.post(base(t) + "/products", simpleProduct("Inny", "kos-s", 100, 0)).code()).isEqualTo("SKU_TAKEN");
        Map<String, Object> badEan = simpleProduct("Zły EAN", "EAN-1", 100, 0);
        ((Map<String, Object>) ((List<?>) badEan.get("variants")).getFirst()).put("ean", "5901234123458");
        assertThat(owner.post(base(t) + "/products", badEan).code()).isEqualTo("INVALID_EAN");
        Map<String, Object> dup = new HashMap<>(product);
        dup.put("name", "Duplikat");
        dup.put("variants", List.of(variant(Map.of("Rozmiar", "S", "Kolor", "Biały"), null, 1, 0), variant(Map.of("Rozmiar", "s", "Kolor", "Biały"), null, 1, 0)));
        assertThat(owner.post(base(t) + "/products", dup).code()).isEqualTo("DUPLICATE_VARIANT");

        // Price reduction: Omnibus shows the lowest price from the 30 days before the reduction
        Map<String, Object> update = new HashMap<>(product);
        List<Map<String, Object>> vs = List.of(variant(Map.of("Rozmiar", "S", "Kolor", "Biały"), "KOS-S", 5900, null),
                variant(Map.of("Rozmiar", "M", "Kolor", "Biały"), "KOS-M", 7900, null));
        vs.get(0).put("id", p.get("variants").get(0).get("id").asString());
        vs.get(0).put("compareAtMinor", 7900L);
        vs.get(1).put("id", p.get("variants").get(1).get("id").asString());
        update.put("variants", vs);
        update.put("version", p.get("version").asLong());
        var updated = owner.put(base(t) + "/products/" + productId, update);
        assertThat(updated.status()).as(updated.body()).isEqualTo(200);
        assertThat(updated.json().get("variants").get(0).get("lowestPrice30dMinor").asLong()).isEqualTo(7900);
        assertThat(updated.json().get("variants").get(0).get("onHand").asInt()).isEqualTo(4); // stock kept
        // Stale version
        assertThat(owner.put(base(t) + "/products/" + productId, update).code()).isEqualTo("VERSION_CONFLICT");

        // Inventory adjustments
        String variantId = p.get("variants").get(0).get("id").asString();
        var adj = owner.post(base(t) + "/inventory/" + variantId + "/adjust", Map.of("mode", "DELTA", "quantity", 6, "reason", "RECEIPT", "note", "Dostawa 12/2026"));
        assertThat(adj.json().get("onHand").asInt()).isEqualTo(10);
        assertThat(owner.post(base(t) + "/inventory/" + variantId + "/adjust", Map.of("mode", "DELTA", "quantity", -11, "reason", "DAMAGE")).code())
                .isEqualTo("INSUFFICIENT_STOCK");
        assertThat(owner.post(base(t) + "/inventory/" + variantId + "/adjust", Map.of("mode", "SET", "quantity", 2, "reason", "CORRECTION"))
                .json().get("onHand").asInt()).isEqualTo(2);
        assertThat(owner.post(base(t) + "/inventory/" + variantId + "/adjust", Map.of("mode", "DELTA", "quantity", 1, "reason", "SALE")).code())
                .isEqualTo("INVALID_REASON");
        var movements = owner.get(base(t) + "/inventory/" + variantId + "/movements").json();
        assertThat(movements.size()).isEqualTo(3);
        assertThat(movements.get(0).get("delta").asInt()).isEqualTo(-8);
        assertThat(movements.get(2).get("reason").asString()).isEqualTo("INITIAL");
        assertThat(movements.get(1).get("actorName").asString()).isEqualTo("Jan Testowy");
        var low = owner.get(base(t) + "/inventory?lowStock=true").json().get("items");
        assertThat(low.size()).isEqualTo(1);
        assertThat(low.get(0).get("sku").asString()).isEqualTo("KOS-S");
        assertThat(owner.get(base(t) + "/products/stats").json().get("lowStockVariants").asInt()).isEqualTo(1);

        // CSV export neutralises spreadsheet formulas
        owner.post(base(t) + "/products", simpleProduct("=HYPERLINK(\"http://zlo\")", "CSV-1", 100, 0));
        var csv = owner.get(base(t) + "/products/export.csv");
        assertThat(csv.status()).isEqualTo(200);
        assertThat(csv.body()).startsWith("﻿id_produktu;nazwa").contains("\"KOS-M\"").contains("\"'=HYPERLINK(\"\"http://zlo\"\")\"");

        // Duplicate, then bulk archive and delete (stock ledger entries go with the product)
        var copy = owner.post(base(t) + "/products/" + productId + "/duplicate", Map.of());
        assertThat(copy.status()).as(copy.body()).isEqualTo(201);
        assertThat(copy.json().get("status").asString()).isEqualTo("DRAFT");
        assertThat(copy.json().get("variants").get(0).get("sku").isNull()).isTrue();
        String copyId = copy.json().get("id").asString();
        assertThat(owner.post(base(t) + "/products/bulk", Map.of("ids", List.of(copyId), "action", "ARCHIVE")).json().get("affected").asInt()).isEqualTo(1);
        assertThat(owner.get(base(t) + "/products").body()).doesNotContain(copyId);
        assertThat(owner.get(base(t) + "/products?status=ARCHIVED").body()).contains(copyId);
        assertThat(owner.delete(base(t) + "/products/" + productId).status()).isEqualTo(204);
        assertThat(owner.get(base(t) + "/products/" + productId).status()).isEqualTo(404);
    }

    @Test
    void productLimitFromPlanCountsOnlyNonArchivedProducts() {
        ApiClient owner = registeredUser(uniqueEmail("limit"));
        String t = createStore(owner, "Mały Sklep", uniqueSlug("maly"));
        ApiClient admin = login("admin@shopivo.test", "Platforma!Testowa-2026");
        assertThat(admin.put("/api/v1/admin/subscriptions/" + t + "/overrides/products.max",
                Map.of("value", "1", "reason", "Test limitu")).status()).isEqualTo(204);

        String first = owner.post(base(t) + "/products", simpleProduct("Pierwszy", "P-1", 100, 1)).json().get("id").asString();
        var refused = owner.post(base(t) + "/products", simpleProduct("Drugi", "P-2", 100, 1));
        assertThat(refused.status()).isEqualTo(402);
        assertThat(refused.code()).isEqualTo("ENTITLEMENT_LIMIT");

        owner.post(base(t) + "/products/bulk", Map.of("ids", List.of(first), "action", "ARCHIVE"));
        assertThat(owner.post(base(t) + "/products", simpleProduct("Drugi", "P-2", 100, 1)).status()).isEqualTo(201);
        // Bringing the archived one back would exceed the limit
        assertThat(owner.post(base(t) + "/products/bulk", Map.of("ids", List.of(first), "action", "ACTIVATE")).status()).isEqualTo(402);
    }

    @Test
    void catalogIsIsolatedBetweenStoresAndProtectedByRoles() {
        ApiClient owner = registeredUser(uniqueEmail("iso-a"));
        String a = createStore(owner, "Sklep A", uniqueSlug("iso-a"));
        var created = owner.post(base(a) + "/products", simpleProduct("Tajny", "SEC-1", 100, 5)).json();
        String productId = created.get("id").asString();
        String variantId = created.get("variants").get(0).get("id").asString();
        String categoryA = owner.post(base(a) + "/categories", Map.of("name", "Kat A", "visible", true, "version", 0)).json().get("id").asString();

        ApiClient other = registeredUser(uniqueEmail("iso-b"));
        String b = createStore(other, "Sklep B", uniqueSlug("iso-b"));
        // Same SKU is fine in another store
        assertThat(other.post(base(b) + "/products", simpleProduct("Swój", "SEC-1", 100, 5)).status()).isEqualTo(201);
        assertThat(other.get(base(b) + "/products/" + productId).status()).isEqualTo(404);
        assertThat(other.get(base(a) + "/products").status()).isEqualTo(404);
        assertThat(other.post(base(b) + "/inventory/" + variantId + "/adjust", Map.of("mode", "SET", "quantity", 0, "reason", "CORRECTION")).status())
                .isEqualTo(404);
        assertThat(other.get(base(b) + "/inventory/" + variantId + "/movements").json().size()).isZero();
        Map<String, Object> withForeignCategory = simpleProduct("Obca kategoria", "X-1", 100, 0);
        withForeignCategory.put("categoryIds", List.of(categoryA));
        assertThat(other.post(base(b) + "/products", withForeignCategory).code()).isEqualTo("CATEGORY_NOT_FOUND");
        assertThat(other.get(base(b) + "/products").json().get("totalItems").asInt()).isEqualTo(1);

        // Order handling staff can read but not change the catalogue
        String staffEmail = uniqueEmail("orders-staff");
        ApiClient staff = registeredUser(staffEmail);
        owner.post("/api/v1/tenants/" + a + "/invitations", Map.of("email", staffEmail, "role", "ORDER_MANAGER"));
        staff.post("/api/v1/invitations/accept", Map.of("token", emails.awaitToken(staffEmail, "Zaproszenie")));
        assertThat(staff.get(base(a) + "/products/" + productId).status()).isEqualTo(200);
        assertThat(staff.post(base(a) + "/products", simpleProduct("Nie wolno", "N-1", 1, 0)).status()).isEqualTo(403);
        assertThat(staff.post(base(a) + "/inventory/" + variantId + "/adjust", Map.of("mode", "SET", "quantity", 0, "reason", "CORRECTION")).status())
                .isEqualTo(403);
    }
}

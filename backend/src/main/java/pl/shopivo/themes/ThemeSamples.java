package pl.shopivo.themes;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.catalog.CatalogViews;
import pl.shopivo.catalog.Categories;
import pl.shopivo.catalog.ProductStatus;
import pl.shopivo.catalog.ProductType;
import pl.shopivo.catalog.Products;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.tenancy.TenantContext;

/**
 * Example products of a template. They are shown only in the merchant's preview (editor, "Podgląd") while the store
 * has no products of its own — never to customers. On the merchant's explicit request they can be added to the store
 * as ordinary products (with copies of the photos in the store's media), to edit or delete like any other.
 */
@Service
public class ThemeSamples {

    /** One example product; {@code image} is a template image reference ({@link ThemeAssets}). */
    public record Sample(String name, String category, long priceMinor, Long compareAtMinor, List<String> sizes, String image, String description) {
    }

    /** A template's category with its picture (given to the category when example products are added). */
    public record SampleCategory(String name, String image) {
    }

    /** Preview-only category tile: name and picture URL. */
    public record SampleCategoryCard(String name, String imageUrl) {
    }

    /** Categories of each template, in display order. Pictures are template images ({@link ThemeAssets}). */
    public static final Map<String, List<SampleCategory>> CATEGORIES = Map.of(
            "VERA", List.of(new SampleCategory("Kobiety", "tpl:vera/women"), new SampleCategory("Mężczyźni", "tpl:vera/men"),
                    new SampleCategory("Akcesoria", "tpl:vera/accessories")),
            "BAWILOO", List.of(new SampleCategory("Pluszaki", "tpl:bawiloo/cat-pluszaki"),
                    new SampleCategory("Zabawa na dworze", "tpl:bawiloo/cat-outdoor"),
                    new SampleCategory("Do kąpieli", "tpl:bawiloo/cat-kapiel"),
                    new SampleCategory("Plastyka i rękodzieło", "tpl:bawiloo/cat-plastyczne"),
                    new SampleCategory("Figurki", "tpl:bawiloo/cat-figurki"),
                    new SampleCategory("Puzzle i łamigłówki", "tpl:bawiloo/cat-ukladanki")));

    /**
     * Demo catalogue used by each template: several templates can share one (e.g. all fashion templates show the same
     * clothes). The catalogue is keyed by the template that owns its pictures.
     */
    public static final Map<String, String> CATALOG_OF = Map.of("VERA", "VERA", "BAWILOO", "BAWILOO");

    /** Example products shown in a template's demo (its catalogue). */
    public static List<Sample> productsFor(String template) {
        return SAMPLES.getOrDefault(CATALOG_OF.getOrDefault(template, template), List.of());
    }

    /** Example categories shown in a template's demo (its catalogue). */
    public static List<SampleCategory> categoriesFor(String template) {
        return CATEGORIES.getOrDefault(CATALOG_OF.getOrDefault(template, template), List.of());
    }

    /** Category tiles per template code, for the preview of a store without categories. */
    public static Map<String, List<SampleCategoryCard>> categoryCards() {
        Map<String, List<SampleCategoryCard>> out = new HashMap<>();
        CATEGORIES.forEach((code, list) -> out.put(code, list.stream().map(c -> new SampleCategoryCard(c.name(),
                ThemeAssets.find(c.image()).map(a -> a.urls().get("w400")).orElse(null))).toList()));
        return out;
    }

    /** What the storefront preview shows: shaped like a product card, priced in PLN. */
    public record SampleCard(String name, String category, long priceMinor, Long compareAtMinor, String imageUrl) {
    }

    private static final String DESC = "Przykładowy produkt szablonu — zmień nazwę, opis, cenę i zdjęcia albo usuń go.";
    private static final List<String> LETTERS = List.of("XS", "S", "M", "L", "XL");

    public static final Map<String, List<Sample>> SAMPLES = Map.of("VERA", List.of(
            new Sample("Płaszcz wełniany Oslo", "Kobiety", 64900, null, LETTERS, "tpl:vera/p-coat", DESC),
            new Sample("Sweter z wełny merino", "Kobiety", 34900, 42900L, LETTERS, "tpl:vera/p-sweater", DESC),
            new Sample("Marynarka lniana Milano", "Mężczyźni", 59900, null, List.of("48", "50", "52", "54"), "tpl:vera/p-blazer", DESC),
            new Sample("Torebka skórzana Siena", "Akcesoria", 44900, null, List.of(), "tpl:vera/p-bag", DESC),
            new Sample("Koszula z organicznej bawełny", "Mężczyźni", 19900, 24900L, List.of("S", "M", "L", "XL"), "tpl:vera/p-shirt", DESC),
            new Sample("Sukienka maxi Lyon", "Kobiety", 38900, null, LETTERS, "tpl:vera/p-dress", DESC),
            new Sample("Spodnie chino Torino", "Mężczyźni", 27900, null, List.of("30", "32", "34", "36"), "tpl:vera/p-chinos", DESC),
            new Sample("Kurtka utility Bergen", "Kobiety", 52900, null, LETTERS, "tpl:vera/p-jacket", DESC)),
            "BAWILOO", List.of(
            toy("Pingwin Lotek", "Figurki", 1799, 2299L, "p-pingwin-lotek"),
            toy("Kotka Kokardka", "Figurki", 1499, 1979L, "p-kotka-kokardka"),
            toy("Dinozaur Gucio", "Figurki", 1799, 2399L, "p-dinozaur-gucio"),
            toy("Piesek Bosman", "Figurki", 1399, 1899L, "p-piesek-bosman"),
            toy("Robot Bolek", "Figurki", 1699, 2299L, "p-robot-bolek"),
            toy("Jednorożec Iskierka", "Figurki", 1979, null, "p-jednorozec-iskierka"),
            toy("Króliczek Miętus", "Pluszaki", 1999, 2499L, "p-maskotka-krolik"),
            toy("Miś Morelek", "Pluszaki", 2999, 3999L, "p-maskotka-mis"),
            toy("Lisek Rudek", "Pluszaki", 2499, 3299L, "p-maskotka-lis"),
            toy("Ośmiorniczka Lila", "Pluszaki", 1699, 2199L, "p-maskotka-osmiornica"),
            toy("Dinozaur Groszek", "Pluszaki", 2299, 2999L, "p-maskotka-dinozaur"),
            toy("Piramidka Misio", "Puzzle i łamigłówki", 1999, null, "p-zabawka-01"),
            toy("Kostka Odkrywca", "Puzzle i łamigłówki", 2999, null, "p-zabawka-02"),
            toy("Piesek Tuptuś", "Zabawa na dworze", 2499, null, "p-zabawka-03"),
            toy("Kaczuszka Klara", "Do kąpieli", 1699, null, "p-zabawka-04"),
            toy("Słonik Trąbuś", "Zabawa na dworze", 2299, null, "p-zabawka-05")));

    private static Sample toy(String name, String category, long price, Long compareAt, String image) {
        return new Sample(name, category, price, compareAt, List.of(), "tpl:bawiloo/" + image, DESC);
    }

    private final Products products;
    private final Categories categories;
    private final AuditLog auditLog;

    ThemeSamples(Products products, Categories categories, AuditLog auditLog) {
        this.products = products;
        this.categories = categories;
        this.auditLog = auditLog;
    }

    /** Cards per template code, for the storefront preview. */
    public static Map<String, List<SampleCard>> cards() {
        Map<String, List<SampleCard>> out = new HashMap<>();
        SAMPLES.forEach((code, list) -> out.put(code, list.stream().map(s -> new SampleCard(s.name(), s.category(), s.priceMinor(), s.compareAtMinor(),
                ThemeAssets.find(s.image()).map(a -> a.urls().get("w400")).orElse(null))).toList()));
        return out;
    }

    /**
     * Adds the template's example products to the current store: missing categories are created, products whose name
     * already exists are skipped (safe to repeat). Products are active with 10 pcs per variant; photos are copied into
     * the store's media, so the merchant owns and can change them. Plan limits apply as for any new product.
     */
    public int importInto(String code) {
        List<Sample> list = SAMPLES.get(code);
        if (list == null) throw new BusinessRuleException("NO_SAMPLES", "Ten szablon nie ma przykładowych produktów.");
        UUID tenant = TenantContext.requireTenantId();
        Map<String, UUID> cats = new HashMap<>();
        for (CatalogViews.CategoryView c : categories.list()) cats.putIfAbsent(c.name().toLowerCase(Locale.ROOT), c.id());
        var existing = products.search(null, null, null, false, Products.Sort.NAME, org.springframework.data.domain.PageRequest.of(0, 1000))
                .map(r -> r.name().toLowerCase(Locale.ROOT)).toSet();
        // Categories first, in the template's order (the menu follows category order), with the template's pictures
        for (SampleCategory c : CATEGORIES.getOrDefault(code, List.of())) {
            String key = c.name().toLowerCase(Locale.ROOT);
            if (cats.containsKey(key)) continue;
            UUID id = categories.create(new Categories.CategoryInput(c.name(), null, null, null, null, true, null, null, 0)).id();
            cats.put(key, id);
            categories.setImage(id, bytes(c.image()));
        }
        for (Sample s : list) {
            if (existing.contains(s.name().toLowerCase(Locale.ROOT))) continue;
            cats.computeIfAbsent(s.category().toLowerCase(Locale.ROOT),
                    k -> categories.create(new Categories.CategoryInput(s.category(), null, null, null, null, true, null, null, 0)).id());
        }
        int created = 0;
        // Created last-to-first: "newest" listings then show them in the template's order
        for (Sample s : list.reversed()) {
            if (existing.contains(s.name().toLowerCase(Locale.ROOT))) continue;
            UUID category = cats.computeIfAbsent(s.category().toLowerCase(Locale.ROOT),
                    k -> categories.create(new Categories.CategoryInput(s.category(), null, null, null, null, true, null, null, 0)).id());
            List<Products.OptionInput> options = s.sizes().isEmpty() ? List.of() : List.of(new Products.OptionInput("Rozmiar", s.sizes()));
            List<Products.VariantInput> variants = new ArrayList<>();
            if (s.sizes().isEmpty()) variants.add(variant(Map.of(), s));
            else for (String size : s.sizes()) variants.add(variant(Map.of("Rozmiar", size), s));
            var product = products.create(new Products.ProductInput(s.name(), null, s.description(), ProductStatus.ACTIVE, ProductType.PHYSICAL,
                    null, null, List.of(category), null, null, options, variants, 0));
            products.addImage(product.id(), bytes(s.image()), s.name());
            created++;
        }
        auditLog.record(AuditEntry.tenant("theme.samples.imported", tenant, "theme", null).with(Map.of("template", code, "created", created)));
        return created;
    }

    private static Products.VariantInput variant(Map<String, String> options, Sample s) {
        return new Products.VariantInput(null, options, null, null, s.priceMinor(), s.compareAtMinor(), null, 800, null, null, null, true, false, 10);
    }

    private static byte[] bytes(String ref) {
        String file = ref.substring(ref.indexOf('/') + 1) + "-w1200.jpg";
        String template = ref.substring(ThemeAssets.PREFIX.length(), ref.indexOf('/'));
        String path = ThemeAssets.resource(template, file).orElseThrow();
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw new IllegalStateException("Missing template image " + path, e);
        }
    }
}

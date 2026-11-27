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
            new Sample("Kurtka utility Bergen", "Kobiety", 52900, null, LETTERS, "tpl:vera/p-jacket", DESC)));

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
        int created = 0;
        for (Sample s : list) {
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

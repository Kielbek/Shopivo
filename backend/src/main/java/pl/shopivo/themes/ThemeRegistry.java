package pl.shopivo.themes;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Theme presets and the settings schema. Fonts are system font stacks — the storefront makes no requests to external
 * font services (no visitor IP sent to third parties; GDPR-friendly and fast).
 */
public final class ThemeRegistry {

    private ThemeRegistry() {
    }

    public enum FieldType { COLOR, SELECT, TEXT, IMAGE, URL }

    public record Field(String key, String label, FieldType type, List<String> options, int maxLength, String group) {
    }

    public record Preset(String code, String name, String description, Map<String, String> defaults, List<SectionRegistry.Section> sections) {
    }

    public static final String DEFAULT_CODE = "ELECTRONICS";
    static final Pattern COLOR = Pattern.compile("^#[0-9A-Fa-f]{6}$");
    static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");

    /** Keys of the old single-hero settings: accepted on read (moved into the hero section), never stored again. */
    static final Set<String> LEGACY = Set.of("heroLayout", "heroTitle", "heroSubtitle", "heroCta", "heroCategory");

    public static final List<Field> FIELDS = List.of(
            new Field("primary", "Kolor główny (przyciski)", FieldType.COLOR, null, 7, "Kolory"),
            new Field("accent", "Kolor akcentu", FieldType.COLOR, null, 7, "Kolory"),
            new Field("background", "Tło strony", FieldType.COLOR, null, 7, "Kolory"),
            new Field("surface", "Tło sekcji", FieldType.COLOR, null, 7, "Kolory"),
            new Field("text", "Kolor tekstu", FieldType.COLOR, null, 7, "Kolory"),
            new Field("font", "Krój pisma", FieldType.SELECT, List.of("sans", "serif", "rounded", "mono", "editorial"), 0, "Typografia"),
            new Field("radius", "Zaokrąglenia", FieldType.SELECT, List.of("none", "soft", "round"), 0, "Typografia"),
            new Field("productCard", "Karty produktów", FieldType.SELECT, List.of("plain", "bordered", "shadow"), 0, "Typografia"),
            new Field("logoImage", "Logo", FieldType.IMAGE, null, 36, "Nagłówek"),
            new Field("headerStyle", "Układ nagłówka", FieldType.SELECT, List.of("classic", "centered"), 0, "Nagłówek"),
            new Field("stickyHeader", "Przyklejony nagłówek", FieldType.SELECT, List.of("yes", "no"), 0, "Nagłówek"),
            new Field("showSearch", "Wyszukiwarka w nagłówku", FieldType.SELECT, List.of("yes", "no"), 0, "Nagłówek"),
            new Field("announcement", "Pasek informacyjny", FieldType.TEXT, null, 120, "Nagłówek"),
            new Field("mobileNav", "Nawigacja w telefonie", FieldType.SELECT, List.of("drawer", "bottom"), 0, "Nagłówek"),
            new Field("footerNote", "Tekst w stopce", FieldType.TEXT, null, 300, "Stopka"),
            new Field("footerNewsletter", "Zapis na newsletter w stopce", FieldType.SELECT, List.of("yes", "no"), 0, "Stopka"),
            new Field("instagram", "Instagram", FieldType.URL, null, 300, "Stopka"),
            new Field("facebook", "Facebook", FieldType.URL, null, 300, "Stopka"),
            new Field("tiktok", "TikTok", FieldType.URL, null, 300, "Stopka"),
            new Field("youtube", "YouTube", FieldType.URL, null, 300, "Stopka"));

    private static Map<String, String> preset(String primary, String accent, String background, String surface, String text,
            String font, String radius, String hero, String card, String title, String subtitle) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("primary", primary);
        m.put("accent", accent);
        m.put("background", background);
        m.put("surface", surface);
        m.put("text", text);
        m.put("font", font);
        m.put("radius", radius);
        m.put("headerStyle", "serif".equals(font) ? "centered" : "classic");
        m.put("stickyHeader", "yes");
        m.put("showSearch", "yes");
        m.put("mobileNav", "round".equals(radius) || "banner".equals(hero) ? "bottom" : "drawer");
        m.put("logoImage", "");
        m.put("footerNewsletter", "yes");
        m.put("instagram", "");
        m.put("facebook", "");
        m.put("tiktok", "");
        m.put("youtube", "");
        m.put("productCard", card);
        m.put("announcement", "");
        m.put("footerNote", "");
        return Map.copyOf(m);
    }

    /** Builds a template's default home page from a short plan, e.g. "usp", "categories:tiles", "products:8". */
    static List<SectionRegistry.Section> plan(String heroLayout, String title, String subtitle, String... items) {
        List<SectionRegistry.Section> out = new java.util.ArrayList<>();
        out.add(SectionRegistry.section("hero", "hero", Map.of("heading", title, "subheading", subtitle, "cta", "Zobacz produkty", "link", "/produkty",
                "layout", heroLayout, "height", "medium")));
        int n = 1;
        for (String item : items) {
            String[] parts = item.split(":");
            String id = parts[0].replace("_", "") + n++;
            out.add(switch (parts[0]) {
                case "usp" -> SectionRegistry.section(id, "usp", SectionRegistry.usp());
                case "categories" -> SectionRegistry.section(id, "categories", Map.of("heading", "Kategorie", "style", parts[1]));
                case "products" -> SectionRegistry.section(id, "products", SectionRegistry.products(parts.length > 2 ? parts[2] : "Nowości", parts[1]));
                case "image_text" -> SectionRegistry.section(id, "image_text", Map.of("heading", "Nasza historia",
                        "text", "Opowiedz klientom, kim jesteś i co wyróżnia Twoje produkty. Zdjęcie dodasz w edytorze.", "cta", "Poznaj nas", "link", "/strona/o-nas"));
                case "faq" -> SectionRegistry.section(id, "faq", SectionRegistry.faq());
                case "newsletter" -> SectionRegistry.section(id, "newsletter", SectionRegistry.newsletter());
                case "reviews" -> SectionRegistry.section(id, "reviews", Map.of("heading", "Co mówią klienci"));
                case "blog" -> SectionRegistry.section(id, "blog", Map.of("heading", "Z bloga", "count", "3"));
                default -> throw new IllegalStateException(item);
            });
        }
        return List.copyOf(out);
    }

    /** VÉRA: editorial fashion template with its own photos (template assets, see {@link ThemeAssets}). */
    private static Preset vera() {
        Map<String, String> d = new LinkedHashMap<>(preset("#141413", "#9A6B4C", "#FAF9F6", "#F5F3EF", "#141413", "editorial", "soft", "editorial", "plain", null, null));
        d.put("headerStyle", "classic");
        d.put("mobileNav", "drawer");
        d.put("announcement", "Nowa kolekcja jesień / zima już w sklepie");
        d.put("footerNote", "Ubrania projektowane z myślą o komforcie na lata — naturalne tkaniny i ponadczasowe kroje.");
        List<SectionRegistry.Section> sections = List.of(
                SectionRegistry.section("hero", "hero", Map.ofEntries(Map.entry("eyebrow", "Kolekcja jesień / zima"),
                        Map.entry("heading", "Ponadczasowa forma i naturalne tkaniny."),
                        Map.entry("subheading", "Odkryj kapsułową garderobę zaprojektowaną z myślą o komforcie na lata. Szlachetne materiały i minimalistyczne kroje."),
                        Map.entry("cta", "Odkryj kolekcję"), Map.entry("link", "/produkty"), Map.entry("cta2", "Promocje"), Map.entry("link2", "/produkty?promocje=tak"),
                        Map.entry("image", "tpl:vera/hero"), Map.entry("layout", "editorial"), Map.entry("height", "medium"), Map.entry("featured", true))),
                SectionRegistry.section("tiles1", "tiles", Map.of("eyebrow", "Przeglądaj działy", "heading", "Kategorie", "items", List.of(
                        Map.of("image", "tpl:vera/women", "title", "Kobiety", "text", "Zobacz produkty", "link", "/produkty"),
                        Map.of("image", "tpl:vera/men", "title", "Mężczyźni", "text", "Zobacz produkty", "link", "/produkty"),
                        Map.of("image", "tpl:vera/accessories", "title", "Akcesoria", "text", "Zobacz produkty", "link", "/produkty")))),
                SectionRegistry.section("products2", "products", Map.of("heading", "Wszystkie produkty", "source", "newest", "count", "8",
                        "buttonText", "Zobacz wszystko", "filters", true)),
                SectionRegistry.section("banner3", "banner", Map.of("image", "tpl:vera/atelier", "eyebrow", "Nasza pracownia",
                        "heading", "Szyjemy w krótkich seriach, z dbałością o każdy detal.",
                        "text", "Opowiedz klientom o swoich materiałach, produkcji i podejściu do mody.")),
                SectionRegistry.section("newsletter4", "newsletter", SectionRegistry.newsletter()));
        return new Preset("VERA", "Véra", "Magazynowy styl mody: szeryfowe nagłówki, duże zdjęcia, kafelki działów i filtry produktów na stronie głównej.",
                Map.copyOf(d), sections);
    }

    /** Button colours are chosen so white text keeps at least 4.5:1 contrast (WCAG AA). */
    public static final List<Preset> PRESETS = List.of(
            vera(),
            new Preset("FASHION", "Atelier", "Elegancka typografia szeryfowa i duże zdjęcia — odzież, obuwie, dodatki.",
                    preset("#111111", "#C8A27C", "#FFFFFF", "#F6F4F1", "#1A1A1A", "serif", "none", "image", "plain", null, null),
                    plan("image", "Nowa kolekcja", "Ponadczasowe fasony w najlepszej jakości.", "categories:tiles", "products:8:Nowa kolekcja", "image_text", "newsletter")),
            new Preset("BEAUTY", "Róża", "Miękkie, pudrowe kolory i zaokrąglenia — kosmetyki, pielęgnacja.",
                    preset("#A23E62", "#F2C4CE", "#FFF9FA", "#FBEFF2", "#3A2530", "serif", "round", "split", "plain", null, null),
                    plan("split", "Naturalna pielęgnacja", "Kosmetyki, które pokochasz od pierwszego użycia.", "usp", "products:8:Bestsellery", "reviews", "newsletter")),
            new Preset("ELECTRONICS", "Volt", "Czysty, techniczny wygląd z naciskiem na parametry — elektronika, AGD.",
                    preset("#2563EB", "#0EA5E9", "#F8FAFC", "#FFFFFF", "#0F172A", "sans", "soft", "split", "bordered", null, null),
                    plan("split", "Technologia na co dzień", "Sprawdzony sprzęt w dobrych cenach.", "usp", "categories:chips", "products:8", "faq")),
            new Preset("TOYS", "Bajka", "Radosne kolory i zaokrąglony krój — zabawki, artykuły dziecięce.",
                    preset("#C2410C", "#8B5CF6", "#FFFBF5", "#FFFFFF", "#2D2A26", "rounded", "round", "centered", "shadow", null, null),
                    plan("centered", "Radość z zabawy", "Zabawki, które rozwijają wyobraźnię.", "categories:tiles", "products:8", "usp", "newsletter")),
            new Preset("HOME", "Ostoja", "Ciepłe, naturalne barwy — dom, wnętrza, ogród.",
                    preset("#5B6E4F", "#D9B48F", "#FAF8F4", "#FFFFFF", "#2F2C27", "serif", "soft", "split", "plain", null, null),
                    plan("split", "Przytulny dom", "Wyposażenie wnętrz z charakterem.", "categories:tiles", "image_text", "products:8", "blog")),
            new Preset("SPORTS", "Sprint", "Dynamiczny, kontrastowy układ — sport, outdoor, fitness.",
                    preset("#15803D", "#FACC15", "#FFFFFF", "#F3F4F6", "#111827", "sans", "soft", "banner", "bordered", null, null),
                    plan("banner", "Gotowi do startu", "Sprzęt dla aktywnych.", "usp", "products:8", "categories:chips", "newsletter")),
            new Preset("AUTOMOTIVE", "Tor", "Mocny, techniczny styl — motoryzacja, części, akcesoria.",
                    preset("#B91C1C", "#1F2937", "#F9FAFB", "#FFFFFF", "#111827", "sans", "none", "banner", "bordered", null, null),
                    plan("banner", "Części i akcesoria", "Szybka wysyłka, sprawdzone marki.", "usp", "categories:chips", "products:12", "faq")),
            new Preset("JEWELRY", "Kruszec", "Luksusowa, oszczędna forma — biżuteria, zegarki.",
                    preset("#7A5F30", "#E8D9B5", "#FFFFFF", "#FAF7F0", "#241F16", "serif", "none", "centered", "plain", null, null),
                    plan("centered", "Ręcznie wykonana biżuteria", "Detale, które zostają na lata.", "products:4:Wyróżnione", "image_text", "reviews", "newsletter")));

    public static Optional<Preset> preset(String code) {
        return PRESETS.stream().filter(p -> p.code().equals(code)).findFirst();
    }

    static final Set<String> KEYS = Set.copyOf(FIELDS.stream().map(Field::key).toList());

    /** Merges settings onto the preset defaults; unknown keys are rejected, values validated. */
    static Map<String, String> validate(String code, Map<String, String> settings) {
        Preset preset = preset(code).orElseThrow(() -> new IllegalArgumentException("Nieznany motyw."));
        Map<String, String> result = new LinkedHashMap<>(preset.defaults());
        if (settings == null) return result;
        for (var e : settings.entrySet()) {
            if (LEGACY.contains(e.getKey())) continue;
            if (!KEYS.contains(e.getKey())) throw new IllegalArgumentException("Nieznane ustawienie: " + e.getKey());
            Field f = FIELDS.stream().filter(x -> x.key().equals(e.getKey())).findFirst().orElseThrow();
            String v = e.getValue() == null ? "" : e.getValue().strip();
            switch (f.type()) {
                case COLOR -> {
                    if (!COLOR.matcher(v).matches()) throw new IllegalArgumentException(f.label() + ": kolor w formacie #RRGGBB.");
                    v = v.toUpperCase();
                }
                case SELECT -> {
                    if (!f.options().contains(v)) throw new IllegalArgumentException(f.label() + ": niedozwolona wartość.");
                }
                case IMAGE -> v = ThemeAssets.image(v, f.label() + ": nieprawidłowy obraz.");
                case URL -> {
                    if (!v.isEmpty() && !SectionRegistry.URL.matcher(v).matches()) {
                        throw new IllegalArgumentException(f.label() + ": podaj pełny adres zaczynający się od https://");
                    }
                }
                case TEXT -> {
                    if (v.length() > f.maxLength()) throw new IllegalArgumentException(f.label() + ": najwyżej " + f.maxLength() + " znaków.");
                    if (v.chars().anyMatch(ch -> ch < 0x20)) throw new IllegalArgumentException(f.label() + ": niedozwolone znaki.");
                }
            }
            result.put(e.getKey(), v);
        }
        return result;
    }
}

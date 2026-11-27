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

    public static final String DEFAULT_CODE = "VERA";

    /**
     * Templates retired on 2026-11-27 (Atelier, Róża, Volt, Bajka, Ostoja, Sprint, Tor, Kruszec): stores that used one
     * keep their texts, sections and settings and are shown with the closest current template.
     */
    static final Map<String, String> RETIRED = Map.of("FASHION", "VERA", "BEAUTY", "VERA", "ELECTRONICS", "VERA", "TOYS", "BAWILOO",
            "HOME", "VERA", "SPORTS", "VERA", "AUTOMOTIVE", "VERA", "JEWELRY", "VERA");

    /** Current template code for a stored one (retired codes map to their successor). */
    public static String current(String code) {
        return code != null && RETIRED.containsKey(code) ? RETIRED.get(code) : code;
    }
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
            new Field("font", "Krój pisma", FieldType.SELECT, List.of("sans", "serif", "rounded", "mono", "editorial", "playful"), 0, "Typografia"),
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

    /** Bawiloo: dark, playful toy-shop template with its own images, carousel and illustrated benefits. */
    private static Preset bawiloo() {
        Map<String, String> d = new LinkedHashMap<>(preset("#F8BF73", "#EBA32B", "#151513", "#1F1F1C", "#FFFFFF", "playful", "round", "playful", "bordered", null, null));
        d.put("headerStyle", "classic");
        d.put("mobileNav", "drawer");
        d.put("announcement", "");
        d.put("footerNote", "Każda zabawka to nowa radość. Trochę więcej wyobraźni, jeszcze więcej zabawy.");
        String link = "/produkty";
        List<SectionRegistry.Section> sections = List.of(
                SectionRegistry.section("hero", "hero", Map.of("heading", "Każda zabawka to nowa radość", "cta", "Kupuj teraz", "link", link,
                        "image", "tpl:bawiloo/hero", "layout", "playful", "height", "medium")),
                SectionRegistry.section("cats1", "categories", Map.of("heading", "Ulubione zabawki dzieci", "style", "circles")),
                SectionRegistry.section("products2", "products", Map.of("eyebrow", "Hity do zabawy", "heading", "Małe figurki,",
                        "accent", "wielkie przygody!", "text", "Poznaj bohaterów, z którymi zabawa nie ma końca.", "style", "grid",
                        "source", "newest", "count", "6", "buttonText", "Zobacz więcej")),
                SectionRegistry.section("usp3", "usp", Map.of("items", List.of(
                        Map.of("icon", "shield", "title", "Bezpieczne płatności", "text", "Bezpieczne płatności przy każdym zakupie."),
                        Map.of("icon", "return", "title", "Łatwe zwroty", "text", "Prosty i wygodny proces zwrotu."),
                        Map.of("icon", "truck", "title", "Szybka dostawa", "text", "Radość prosto pod Twoje drzwi."),
                        Map.of("icon", "chat", "title", "Pomoc online", "text", "Jesteśmy tu, aby Ci pomóc.")))),
                SectionRegistry.section("deals4", "products", Map.of("eyebrow", "Wyjątkowe oferty", "heading", "Wielka radość,", "accent", "małe ceny!",
                        "text", "Więcej zabawy. Więcej uśmiechu. Mniej wydatków.", "style", "carousel", "source", "sale", "count", "8",
                        "buttonText", "Zobacz wszystkie promocje")),
                SectionRegistry.section("about5", "image_text", Map.of("eyebrow", "O nas", "heading", "Zrodzone z dziecięcej radości",
                        "text", "Wierzymy, że każde dziecko zasługuje na świat pełen wyobraźni, śmiechu i przygód. Nasze zabawki inspirują małych odkrywców i wnoszą radość do każdej chwili zabawy.",
                        "cta", "Poznaj nasze zabawki", "link", link, "image", "tpl:bawiloo/about", "imageSide", "right", "shape", "flower")),
                SectionRegistry.section("newsletter6", "newsletter", Map.of("eyebrow", "Klub rodziców", "heading", "Radość prosto do Twojej skrzynki!",
                        "text", "Dołącz do newslettera i odkrywaj nowości, wyjątkowe promocje oraz pomysły na wspólną zabawę.", "button", "Zapisz się")));
        return new Preset("BAWILOO", "Bawiloo", "Radosny sklep z zabawkami na ciemnym tle: złoty nagłówek, okrągłe kategorie, karuzela promocji i ilustrowane korzyści.",
                Map.copyOf(d), sections);
    }

    /** Button colours are chosen so white text keeps at least 4.5:1 contrast (WCAG AA). */
    public static final List<Preset> PRESETS = List.of(
            vera(),
            bawiloo());

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

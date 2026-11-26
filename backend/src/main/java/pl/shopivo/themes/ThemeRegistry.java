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

    public enum FieldType { COLOR, SELECT, TEXT }

    public record Field(String key, String label, FieldType type, List<String> options, int maxLength, String group) {
    }

    public record Preset(String code, String name, String description, Map<String, String> defaults) {
    }

    public static final String DEFAULT_CODE = "ELECTRONICS";
    static final Pattern COLOR = Pattern.compile("^#[0-9A-Fa-f]{6}$");
    static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");

    public static final List<Field> FIELDS = List.of(
            new Field("primary", "Kolor główny (przyciski)", FieldType.COLOR, null, 7, "Kolory"),
            new Field("accent", "Kolor akcentu", FieldType.COLOR, null, 7, "Kolory"),
            new Field("background", "Tło strony", FieldType.COLOR, null, 7, "Kolory"),
            new Field("surface", "Tło sekcji", FieldType.COLOR, null, 7, "Kolory"),
            new Field("text", "Kolor tekstu", FieldType.COLOR, null, 7, "Kolory"),
            new Field("font", "Krój pisma", FieldType.SELECT, List.of("sans", "serif", "rounded", "mono"), 0, "Typografia i kształt"),
            new Field("radius", "Zaokrąglenia", FieldType.SELECT, List.of("none", "soft", "round"), 0, "Typografia i kształt"),
            new Field("heroLayout", "Układ strony głównej", FieldType.SELECT, List.of("centered", "split", "banner"), 0, "Strona główna"),
            new Field("productCard", "Karty produktów", FieldType.SELECT, List.of("plain", "bordered", "shadow"), 0, "Strona główna"),
            new Field("heroTitle", "Nagłówek strony głównej", FieldType.TEXT, null, 80, "Strona główna"),
            new Field("heroSubtitle", "Podtytuł", FieldType.TEXT, null, 200, "Strona główna"),
            new Field("heroCta", "Tekst przycisku", FieldType.TEXT, null, 30, "Strona główna"),
            new Field("heroCategory", "Kategoria przycisku (adres)", FieldType.TEXT, null, 140, "Strona główna"),
            new Field("announcement", "Pasek informacyjny", FieldType.TEXT, null, 120, "Komunikaty"),
            new Field("footerNote", "Tekst w stopce", FieldType.TEXT, null, 300, "Komunikaty"));

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
        m.put("heroLayout", hero);
        m.put("productCard", card);
        m.put("heroTitle", title);
        m.put("heroSubtitle", subtitle);
        m.put("heroCta", "Zobacz produkty");
        m.put("heroCategory", "");
        m.put("announcement", "");
        m.put("footerNote", "");
        return Map.copyOf(m);
    }

    /** Button colours are chosen so white text keeps at least 4.5:1 contrast (WCAG AA). */
    public static final List<Preset> PRESETS = List.of(
            new Preset("FASHION", "Atelier", "Elegancka typografia szeryfowa i duże zdjęcia — odzież, obuwie, dodatki.",
                    preset("#111111", "#C8A27C", "#FFFFFF", "#F6F4F1", "#1A1A1A", "serif", "none", "banner", "plain",
                            "Nowa kolekcja", "Ponadczasowe fasony w najlepszej jakości.")),
            new Preset("BEAUTY", "Róża", "Miękkie, pudrowe kolory i zaokrąglenia — kosmetyki, pielęgnacja.",
                    preset("#A23E62", "#F2C4CE", "#FFF9FA", "#FBEFF2", "#3A2530", "serif", "round", "split", "plain",
                            "Naturalna pielęgnacja", "Kosmetyki, które pokochasz od pierwszego użycia.")),
            new Preset("ELECTRONICS", "Volt", "Czysty, techniczny wygląd z naciskiem na parametry — elektronika, AGD.",
                    preset("#2563EB", "#0EA5E9", "#F8FAFC", "#FFFFFF", "#0F172A", "sans", "soft", "split", "bordered",
                            "Technologia na co dzień", "Sprawdzony sprzęt w dobrych cenach.")),
            new Preset("TOYS", "Bajka", "Radosne kolory i zaokrąglony krój — zabawki, artykuły dziecięce.",
                    preset("#C2410C", "#8B5CF6", "#FFFBF5", "#FFFFFF", "#2D2A26", "rounded", "round", "centered", "shadow",
                            "Radość z zabawy", "Zabawki, które rozwijają wyobraźnię.")),
            new Preset("HOME", "Ostoja", "Ciepłe, naturalne barwy — dom, wnętrza, ogród.",
                    preset("#5B6E4F", "#D9B48F", "#FAF8F4", "#FFFFFF", "#2F2C27", "serif", "soft", "split", "plain",
                            "Przytulny dom", "Wyposażenie wnętrz z charakterem.")),
            new Preset("SPORTS", "Sprint", "Dynamiczny, kontrastowy układ — sport, outdoor, fitness.",
                    preset("#15803D", "#FACC15", "#FFFFFF", "#F3F4F6", "#111827", "sans", "soft", "banner", "bordered",
                            "Gotowi do startu", "Sprzęt dla aktywnych.")),
            new Preset("AUTOMOTIVE", "Tor", "Mocny, techniczny styl — motoryzacja, części, akcesoria.",
                    preset("#B91C1C", "#1F2937", "#F9FAFB", "#FFFFFF", "#111827", "sans", "none", "banner", "bordered",
                            "Części i akcesoria", "Szybka wysyłka, sprawdzone marki.")),
            new Preset("JEWELRY", "Kruszec", "Luksusowa, oszczędna forma — biżuteria, zegarki.",
                    preset("#7A5F30", "#E8D9B5", "#FFFFFF", "#FAF7F0", "#241F16", "serif", "none", "centered", "plain",
                            "Ręcznie wykonana biżuteria", "Detale, które zostają na lata.")));

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
                case TEXT -> {
                    if (v.length() > f.maxLength()) throw new IllegalArgumentException(f.label() + ": najwyżej " + f.maxLength() + " znaków.");
                    if (v.chars().anyMatch(ch -> ch < 0x20)) throw new IllegalArgumentException(f.label() + ": niedozwolone znaki.");
                    if (f.key().equals("heroCategory") && !v.isEmpty() && !SLUG.matcher(v).matches()) {
                        throw new IllegalArgumentException(f.label() + ": podaj adres kategorii, np. koszulki.");
                    }
                }
            }
            result.put(e.getKey(), v);
        }
        return result;
    }
}

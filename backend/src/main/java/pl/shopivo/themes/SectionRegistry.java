package pl.shopivo.themes;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Home-page sections: the building blocks a merchant adds, orders, switches on/off and fills (hero, benefits, categories,
 * products, image with text, FAQ, newsletter, reviews, text, blog). Every value is validated against the type's schema —
 * unknown keys are rejected, texts are length-limited, links are internal paths or https URLs, images and categories are
 * ids (resolved later only within the store's own data).
 */
public final class SectionRegistry {

    private SectionRegistry() {
    }

    public enum Kind { TEXT, TEXTAREA, SELECT, LINK, IMAGE, CATEGORY, CATEGORIES, ITEMS, TOGGLE }

    public record Prop(String key, String label, Kind kind, List<String> options, int max, List<Prop> itemProps, String help) {
        static Prop text(String key, String label, int max) {
            return new Prop(key, label, Kind.TEXT, null, max, null, null);
        }

        static Prop area(String key, String label, int max) {
            return new Prop(key, label, Kind.TEXTAREA, null, max, null, null);
        }

        static Prop select(String key, String label, String... options) {
            return new Prop(key, label, Kind.SELECT, List.of(options), 0, null, null);
        }

        static Prop of(String key, String label, Kind kind, String help) {
            return new Prop(key, label, kind, null, kind == Kind.CATEGORIES ? 12 : 0, null, help);
        }

        static Prop items(String key, String label, int max, Prop... item) {
            return new Prop(key, label, Kind.ITEMS, null, max, List.of(item), null);
        }
    }

    public record SectionType(String type, String name, String description, List<Prop> props) {
    }

    /** One section on the page: {@code data} holds the values for the type's props. */
    public record Section(String id, String type, boolean enabled, Map<String, Object> data) {
    }

    public static final int MAX_SECTIONS = 20;
    static final Pattern ID = Pattern.compile("^[a-z0-9]{4,24}$");
    static final Pattern PATH = Pattern.compile("^/[a-z0-9/_?=&.-]{0,199}$");
    static final Pattern URL = Pattern.compile("^https://[^\\s<>\"]{3,290}$");

    public static final List<SectionType> TYPES = List.of(
            new SectionType("hero", "Baner główny", "Duży nagłówek na górze strony: hasło, opis, przycisk i zdjęcie.", List.of(
                    Prop.text("eyebrow", "Nadtytuł", 60), Prop.text("heading", "Nagłówek", 80), Prop.area("subheading", "Opis", 240),
                    Prop.text("cta", "Tekst przycisku", 30),
                    Prop.of("link", "Przycisk prowadzi do", Kind.LINK, "Np. kategoria, strona lub wszystkie produkty."),
                    Prop.text("cta2", "Drugi przycisk", 30), Prop.of("link2", "Drugi przycisk prowadzi do", Kind.LINK, null),
                    Prop.of("image", "Zdjęcie", Kind.IMAGE, "Najlepiej poziome, min. 1600 px szerokości."),
                    Prop.select("layout", "Układ", "banner", "split", "image", "centered", "editorial", "playful"),
                    Prop.select("height", "Wysokość", "small", "medium", "large"),
                    Prop.of("featured", "Karta polecanego produktu na zdjęciu", Kind.TOGGLE, "Najnowszy dostępny produkt (układ „Magazyn”)."))),
            new SectionType("usp", "Korzyści", "Krótkie hasła budujące zaufanie, np. darmowa dostawa, 30 dni na zwrot.", List.of(
                    Prop.items("items", "Korzyści", 4, Prop.select("icon", "Ikona", "truck", "return", "shield", "card", "gift", "leaf", "star", "chat"),
                            Prop.text("title", "Tytuł", 40), Prop.text("text", "Opis", 90)))),
            new SectionType("categories", "Kategorie", "Kafelki kategorii ze zdjęciami lub lista przycisków.", List.of(
                    Prop.text("eyebrow", "Nadtytuł", 60), Prop.text("heading", "Nagłówek", 60),
                    Prop.of("categories", "Kategorie", Kind.CATEGORIES, "Puste = kategorie główne w kolejności sklepu."),
                    Prop.select("style", "Wygląd", "tiles", "chips"))),
            new SectionType("products", "Produkty", "Siatka produktów: nowości, promocje albo wybrana kategoria (np. nowa kolekcja).", List.of(
                    Prop.text("eyebrow", "Nadtytuł", 60), Prop.text("heading", "Nagłówek", 60),
                    Prop.text("accent", "Druga linia nagłówka (wyróżniona)", 60), Prop.text("text", "Opis pod nagłówkiem", 160),
                    Prop.select("style", "Wygląd", "grid", "carousel"),
                    Prop.select("source", "Jakie produkty", "newest", "sale", "category"),
                    Prop.of("category", "Kategoria", Kind.CATEGORY, "Dla „Wybrana kategoria”."),
                    Prop.select("count", "Liczba produktów", "4", "6", "8", "12"), Prop.text("buttonText", "Tekst linku", 30),
                    Prop.of("filters", "Filtry kategorii i sortowanie", Kind.TOGGLE, "Klient przełącza kategorie główne bez opuszczania strony."))),
            new SectionType("tiles", "Kafelki ze zdjęciami", "2–6 kafelków prowadzące do kategorii, kolekcji lub stron.", List.of(
                    Prop.text("eyebrow", "Nadtytuł", 60), Prop.text("heading", "Nagłówek", 60),
                    Prop.select("style", "Wygląd", "cards", "circles"),
                    Prop.items("items", "Kafelki", 6, Prop.of("image", "Zdjęcie", Kind.IMAGE, null), Prop.text("title", "Tytuł", 40),
                            Prop.text("text", "Podpis", 40), Prop.of("link", "Prowadzi do", Kind.LINK, null)),
                    Prop.text("cta", "Przycisk pod kafelkami", 30), Prop.of("link", "Przycisk prowadzi do", Kind.LINK, null))),
            new SectionType("banner", "Baner na zdjęciu", "Hasło na tle zdjęcia — historia marki, kolekcja, wartości.", List.of(
                    Prop.of("image", "Zdjęcie", Kind.IMAGE, "Poziome, min. 1600 px szerokości."), Prop.text("eyebrow", "Nadtytuł", 60),
                    Prop.text("heading", "Nagłówek", 100), Prop.area("text", "Tekst", 300), Prop.text("cta", "Tekst przycisku", 30),
                    Prop.of("link", "Przycisk prowadzi do", Kind.LINK, null))),
            new SectionType("image_text", "Obraz z tekstem", "Zdjęcie obok tekstu — historia marki, kolekcja, wyróżniony produkt.", List.of(
                    Prop.of("image", "Zdjęcie", Kind.IMAGE, null), Prop.text("eyebrow", "Nadtytuł", 60), Prop.text("heading", "Nagłówek", 80),
                    Prop.area("text", "Tekst", 600),
                    Prop.text("cta", "Tekst przycisku", 30), Prop.of("link", "Przycisk prowadzi do", Kind.LINK, null),
                    Prop.select("imageSide", "Zdjęcie po stronie", "left", "right"),
                    Prop.select("shape", "Kształt zdjęcia", "rounded", "flower"))),
            new SectionType("faq", "Najczęstsze pytania", "Pytania i odpowiedzi — rozwijane, dobre też dla Google.", List.of(
                    Prop.text("heading", "Nagłówek", 60),
                    Prop.items("items", "Pytania", 12, Prop.text("question", "Pytanie", 150), Prop.area("answer", "Odpowiedź", 1000)))),
            new SectionType("newsletter", "Newsletter", "Zapis na newsletter z potwierdzeniem e-mail (zgodnie z RODO).", List.of(
                    Prop.text("eyebrow", "Nadtytuł", 60), Prop.text("heading", "Nagłówek", 80), Prop.text("text", "Opis", 200),
                    Prop.text("button", "Tekst przycisku", 30))),
            new SectionType("reviews", "Opinie klientów", "Najnowsze zatwierdzone opinie o produktach.", List.of(
                    Prop.text("heading", "Nagłówek", 60))),
            new SectionType("rich_text", "Tekst", "Akapit tekstu, np. o sklepie lub ważna informacja.", List.of(
                    Prop.text("heading", "Nagłówek", 80), Prop.area("text", "Tekst", 2000), Prop.select("align", "Wyrównanie", "center", "left"))),
            new SectionType("blog", "Z bloga", "Najnowsze wpisy z bloga sklepu.", List.of(
                    Prop.text("heading", "Nagłówek", 60), Prop.select("count", "Liczba wpisów", "3", "6"))));

    public static Optional<SectionType> type(String type) {
        return TYPES.stream().filter(t -> t.type().equals(type)).findFirst();
    }

    /** Validates and normalises sections (missing values get defaults). Throws IllegalArgumentException with a Polish message. */
    public static List<Section> validate(List<Section> in) {
        if (in == null) return null;
        if (in.size() > MAX_SECTIONS) throw new IllegalArgumentException("Strona główna może mieć najwyżej " + MAX_SECTIONS + " sekcji.");
        Set<String> ids = new HashSet<>();
        List<Section> out = new ArrayList<>();
        for (Section s : in) {
            if (s == null || s.id() == null || !ID.matcher(s.id()).matches() || !ids.add(s.id())) {
                throw new IllegalArgumentException("Nieprawidłowy identyfikator sekcji.");
            }
            SectionType t = type(s.type()).orElseThrow(() -> new IllegalArgumentException("Nieznany rodzaj sekcji."));
            out.add(new Section(s.id(), t.type(), s.enabled(), values(t.name(), t.props(), s.data())));
        }
        return List.copyOf(out);
    }

    private static Map<String, Object> values(String where, List<Prop> props, Map<String, Object> data) {
        Map<String, Object> in = data == null ? Map.of() : data;
        Set<String> known = new HashSet<>(props.stream().map(Prop::key).toList());
        for (String k : in.keySet()) {
            if (!known.contains(k)) throw new IllegalArgumentException(where + ": nieznane pole " + k + ".");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Prop p : props) out.put(p.key(), value(where, p, in.get(p.key())));
        return out;
    }

    private static Object value(String where, Prop p, Object raw) {
        String label = where + " → " + p.label();
        return switch (p.kind()) {
            case TOGGLE -> raw instanceof Boolean b ? b : Boolean.FALSE;
            case TEXT, TEXTAREA -> {
                String v = raw == null ? "" : String.valueOf(raw).strip();
                if (v.length() > p.max()) throw new IllegalArgumentException(label + ": najwyżej " + p.max() + " znaków.");
                boolean multiline = p.kind() == Kind.TEXTAREA;
                if (v.chars().anyMatch(ch -> ch < 0x20 && !(multiline && (ch == '\n' || ch == '\r' || ch == '\t')))) {
                    throw new IllegalArgumentException(label + ": niedozwolone znaki.");
                }
                yield v.replace("\r", "");
            }
            case SELECT -> {
                String v = raw == null ? p.options().getFirst() : String.valueOf(raw);
                if (!p.options().contains(v)) throw new IllegalArgumentException(label + ": niedozwolona wartość.");
                yield v;
            }
            case LINK -> {
                String v = raw == null ? "" : String.valueOf(raw).strip();
                if (!v.isEmpty() && !PATH.matcher(v).matches() && !URL.matcher(v).matches()) {
                    throw new IllegalArgumentException(label + ": podaj adres w sklepie (np. /kategoria/kubki) albo https://…");
                }
                yield v;
            }
            case IMAGE -> ThemeAssets.image(raw == null ? "" : String.valueOf(raw), label + ": nieprawidłowe zdjęcie.");
            case CATEGORY -> {
                String v = raw == null ? "" : String.valueOf(raw).strip();
                if (!v.isEmpty()) uuid(label, v);
                yield v;
            }
            case CATEGORIES -> {
                List<?> list = raw instanceof List<?> l ? l : List.of();
                if (list.size() > p.max()) throw new IllegalArgumentException(label + ": najwyżej " + p.max() + ".");
                List<String> ids = new ArrayList<>();
                for (Object o : list) ids.add(uuid(label, String.valueOf(o)).toString());
                yield List.copyOf(new java.util.LinkedHashSet<>(ids));
            }
            case ITEMS -> {
                List<?> list = raw instanceof List<?> l ? l : List.of();
                if (list.size() > p.max()) throw new IllegalArgumentException(label + ": najwyżej " + p.max() + ".");
                List<Map<String, Object>> items = new ArrayList<>();
                for (Object o : list) {
                    if (!(o instanceof Map<?, ?> m)) throw new IllegalArgumentException(label + ": nieprawidłowy element.");
                    Map<String, Object> typed = new LinkedHashMap<>();
                    m.forEach((k, v) -> typed.put(String.valueOf(k), v));
                    items.add(values(label, p.itemProps(), typed));
                }
                yield List.copyOf(items);
            }
        };
    }

    private static UUID uuid(String label, String v) {
        try {
            return UUID.fromString(v);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(label + ": nieprawidłowy identyfikator.");
        }
    }

    /** Image ids used by the sections (to resolve their URLs for the storefront). */
    public static Set<String> imageIds(List<Section> sections) {
        Set<String> out = new HashSet<>();
        if (sections == null) return out;
        for (Section s : sections) {
            type(s.type()).ifPresent(t -> t.props().stream().filter(p -> p.kind() == Kind.IMAGE).forEach(p -> {
                Object v = s.data().get(p.key());
                if (v instanceof String str && !str.isEmpty()) out.add(str);
            }));
        }
        return out;
    }

    // ---------------------------------------------------------------------------------------------------- defaults

    static Section section(String id, String type, Map<String, Object> data) {
        return new Section(id, type, true, values(type, type(type).orElseThrow().props(), data));
    }

    static Map<String, Object> usp() {
        return Map.of("items", List.of(
                Map.of("icon", "truck", "title", "Szybka wysyłka", "text", "Zamówienia wysyłamy w dni robocze."),
                Map.of("icon", "return", "title", "14 dni na zwrot", "text", "Bez podawania przyczyny."),
                Map.of("icon", "shield", "title", "Bezpieczne płatności", "text", "BLIK, karty i szybkie przelewy.")));
    }

    static Map<String, Object> faq() {
        return Map.of("heading", "Najczęstsze pytania", "items", List.of(
                Map.of("question", "Ile trwa dostawa?", "answer", "Zamówienia wysyłamy w dni robocze. Czas dostawy zależy od wybranego przewoźnika."),
                Map.of("question", "Czy mogę zwrócić produkt?", "answer", "Tak — masz 14 dni na odstąpienie od umowy bez podawania przyczyny. Szczegóły znajdziesz na stronie „Zwroty i reklamacje”."),
                Map.of("question", "Jak mogę zapłacić?", "answer", "Dostępne metody płatności zobaczysz w koszyku przed złożeniem zamówienia.")));
    }

    static Map<String, Object> newsletter() {
        return Map.of("heading", "Bądź na bieżąco", "text", "Nowości i promocje prosto na Twój e-mail. Możesz wypisać się w każdej chwili.", "button", "Zapisz się");
    }

    static Map<String, Object> products(String heading, String count) {
        return Map.of("heading", heading, "source", "newest", "count", count, "buttonText", "Wszystkie produkty");
    }
}

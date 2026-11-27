package pl.shopivo.themes;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Images that ship with a template (its banner, tiles, editorial photos). They live next to the template's code
 * ({@code resources/themes/<template>/<name>-w400.jpg} and {@code -w1200.jpg}) and are shared by every store — a store
 * never gets a copy. Sections and settings point at them with a reference such as {@code tpl:vera/hero}; when the
 * merchant picks their own photo, the reference is simply replaced by the id of an image from the store's library.
 * Sources and licences of every file: docs/THEME_ASSETS.md.
 */
public final class ThemeAssets {

    private ThemeAssets() {
    }

    public static final String PREFIX = "tpl:";
    /** Variants served for every asset — the same widths as uploaded images, so pages treat both alike. */
    public static final List<String> VARIANTS = List.of("w400", "w1200");
    static final Pattern REF = Pattern.compile("^tpl:([a-z0-9]{2,20})/([a-z0-9-]{2,40})$");

    /** One template image: reference stored in the theme, label for the editor, URLs of its variants. */
    public record Asset(String ref, String template, String label, Map<String, String> urls) {
    }

    private static Asset asset(String template, String name, String label) {
        Map<String, String> urls = new LinkedHashMap<>();
        for (String v : VARIANTS) urls.put(v, "/api/v1/theme-assets/" + template + "/" + name + "-" + v + ".jpg");
        return new Asset(PREFIX + template + "/" + name, template, label, Map.copyOf(urls));
    }

    public static final List<Asset> ALL = List.of(
            asset("vera", "hero", "Baner — kampania"),
            asset("vera", "women", "Kafelek — kobiety"),
            asset("vera", "men", "Kafelek — mężczyźni"),
            asset("vera", "accessories", "Kafelek — akcesoria"),
            asset("vera", "atelier", "Baner — pracownia"));

    public static boolean isRef(String value) {
        return value != null && value.startsWith(PREFIX);
    }

    public static Optional<Asset> find(String ref) {
        return ALL.stream().filter(a -> a.ref().equals(ref)).findFirst();
    }

    /** Classpath location of a served file, only for registered assets and variants (nothing else is reachable). */
    public static Optional<String> resource(String template, String file) {
        for (Asset a : ALL) {
            if (!a.template().equals(template)) continue;
            for (String v : VARIANTS) {
                String name = a.ref().substring(a.ref().indexOf('/') + 1) + "-" + v + ".jpg";
                if (name.equals(file)) return Optional.of("themes/" + template + "/" + file);
            }
        }
        return Optional.empty();
    }

    /** Reference → URLs (merged with the store's library for the storefront and the editor). */
    public static Map<String, Map<String, String>> urls() {
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        for (Asset a : ALL) out.put(a.ref(), a.urls());
        return out;
    }

    /**
     * Validates an image value: empty, a UUID of an image in the store's library, or a known template reference.
     * Returns the normalised value; throws IllegalArgumentException with the given message otherwise.
     */
    static String image(String value, String error) {
        String v = value == null ? "" : value.strip();
        if (v.isEmpty()) return v;
        if (isRef(v)) {
            if (!REF.matcher(v).matches() || find(v).isEmpty()) throw new IllegalArgumentException(error);
            return v;
        }
        try {
            return java.util.UUID.fromString(v).toString();
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(error);
        }
    }
}

package pl.shopivo.shared.web;

import java.text.Normalizer;
import java.util.Locale;

public final class Slugs {

    private Slugs() {
    }

    /** Converts free text (also Polish diacritics) into a URL slug: "Łódzka Kawa!" → "lodzka-kawa". */
    public static String slugify(String input) {
        if (input == null) {
            return "";
        }
        String s = input.toLowerCase(Locale.ROOT).replace('ł', 'l');
        s = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        s = s.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        return s;
    }
}

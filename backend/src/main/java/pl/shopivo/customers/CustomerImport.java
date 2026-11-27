package pl.shopivo.customers;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import pl.shopivo.shared.error.BusinessRuleException;

/**
 * CSV of customers for import. Separator {@code ;} or {@code ,} (detected from the header), quotes as in RFC 4180,
 * optional UTF-8 BOM. Headers are matched case- and accent-insensitively in Polish or English (the export uses
 * {@link #HEADER}). Only the e-mail column is required.
 */
final class CustomerImport {

    static final List<String> HEADER = List.of("email", "imie", "nazwisko", "telefon", "firma", "adres", "adres2", "kod_pocztowy",
            "miasto", "kraj", "tagi", "zgoda_marketingowa", "notatka", "zamowienia", "wydana_kwota");

    static final int MAX_ROWS = 10_000;
    static final int MAX_CHARS = 5 * 1024 * 1024;

    private static final Map<String, String> ALIASES = new HashMap<>();

    static {
        alias("email", "email", "e-mail", "e_mail", "adres_email", "adres e-mail");
        alias("firstName", "imie", "first name", "first_name", "firstname");
        alias("lastName", "nazwisko", "last name", "last_name", "lastname");
        alias("phone", "telefon", "phone", "numer telefonu", "nr_telefonu");
        alias("company", "firma", "company", "nazwa firmy");
        alias("line1", "adres", "ulica", "address", "address1", "address 1", "default address address1");
        alias("line2", "adres2", "address2", "address 2", "default address address2");
        alias("postalCode", "kod_pocztowy", "kod pocztowy", "kod", "zip", "postal code", "postal_code", "default address zip");
        alias("city", "miasto", "miejscowosc", "city", "default address city");
        alias("countryCode", "kraj", "country", "country code", "country_code", "default address country code");
        alias("tags", "tagi", "tags");
        alias("marketing", "zgoda_marketingowa", "zgoda marketingowa", "zgoda", "accepts email marketing", "accepts marketing", "newsletter");
        alias("note", "notatka", "note", "notes", "uwagi");
    }

    private static void alias(String field, String... names) {
        for (String n : names) ALIASES.put(key(n), field);
    }

    private static final Set<String> YES = Set.of("tak", "t", "yes", "y", "true", "1", "x");

    record Row(int line, String email, String firstName, String lastName, String phone, Customers.Address address, List<String> tags,
            boolean acceptsMarketing, String note) {

        boolean isBlank() {
            return Customers.blank(firstName) && Customers.blank(lastName) && Customers.blank(phone) && address.isEmpty() && tags.isEmpty()
                    && Customers.blank(note);
        }
    }

    private CustomerImport() {
    }

    static List<Row> parse(String content) {
        if (content == null || content.isBlank()) throw new BusinessRuleException("IMPORT_EMPTY", "Plik jest pusty.");
        if (content.length() > MAX_CHARS) throw new BusinessRuleException("IMPORT_TOO_LARGE", "Plik jest za duży (maks. 5 MB).");
        String text = content.charAt(0) == '﻿' ? content.substring(1) : content;
        int firstLineEnd = text.indexOf('\n');
        String headerLine = firstLineEnd < 0 ? text : text.substring(0, firstLineEnd);
        char sep = count(headerLine, ';') >= count(headerLine, ',') && count(headerLine, ';') > 0 ? ';' : ',';
        List<List<String>> records = records(text, sep);
        if (records.isEmpty()) throw new BusinessRuleException("IMPORT_EMPTY", "Plik jest pusty.");
        Map<String, Integer> col = new HashMap<>();
        List<String> header = records.get(0);
        for (int i = 0; i < header.size(); i++) {
            String field = ALIASES.get(key(header.get(i)));
            if (field != null) col.putIfAbsent(field, i);
        }
        if (!col.containsKey("email")) {
            throw new BusinessRuleException("IMPORT_NO_EMAIL", "Brak kolumny „email” w pierwszym wierszu pliku. Pobierz przykładowy plik i porównaj nagłówki.");
        }
        if (records.size() - 1 > MAX_ROWS) {
            throw new BusinessRuleException("IMPORT_TOO_MANY", "Jednorazowo możesz zaimportować najwyżej " + MAX_ROWS + " klientów. Podziel plik.");
        }
        List<Row> rows = new ArrayList<>();
        for (int r = 1; r < records.size(); r++) {
            List<String> rec = records.get(r);
            if (rec.size() == 1 && rec.get(0).isBlank()) continue;
            String tags = get(rec, col, "tags");
            rows.add(new Row(r + 1, get(rec, col, "email"), get(rec, col, "firstName"), get(rec, col, "lastName"), get(rec, col, "phone"),
                    new Customers.Address(get(rec, col, "company"), get(rec, col, "line1"), get(rec, col, "line2"), get(rec, col, "postalCode"),
                            get(rec, col, "city"), get(rec, col, "countryCode")),
                    tags == null ? List.of() : Arrays.stream(tags.split("[,|]")).map(String::strip).filter(s -> !s.isEmpty()).toList(),
                    YES.contains(String.valueOf(get(rec, col, "marketing")).strip().toLowerCase(Locale.ROOT)), get(rec, col, "note")));
        }
        return rows;
    }

    private static String get(List<String> rec, Map<String, Integer> col, String field) {
        Integer i = col.get(field);
        if (i == null || i >= rec.size()) return null;
        String v = rec.get(i).strip();
        // Undo the spreadsheet-formula guard the export adds ('+48..., '=...).
        if (v.length() > 1 && v.charAt(0) == '\'' && "=+-@".indexOf(v.charAt(1)) >= 0) v = v.substring(1);
        return v.isEmpty() ? null : v;
    }

    /** RFC 4180 records: quoted fields may contain separators, quotes ("") and line breaks. */
    static List<List<String>> records(String text, char sep) {
        List<List<String>> out = new ArrayList<>();
        List<String> rec = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (quoted) {
                if (ch == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        quoted = false;
                    }
                } else {
                    field.append(ch);
                }
            } else if (ch == '"' && field.isEmpty()) {
                quoted = true;
            } else if (ch == sep) {
                rec.add(field.toString());
                field.setLength(0);
            } else if (ch == '\n' || ch == '\r') {
                if (ch == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
                rec.add(field.toString());
                field.setLength(0);
                out.add(rec);
                rec = new ArrayList<>();
            } else {
                field.append(ch);
            }
        }
        if (!field.isEmpty() || !rec.isEmpty()) {
            rec.add(field.toString());
            out.add(rec);
        }
        return out;
    }

    private static int count(String s, char c) {
        int n = 0;
        for (int i = 0; i < s.length(); i++) if (s.charAt(i) == c) n++;
        return n;
    }

    private static String key(String header) {
        String n = Normalizer.normalize(header.strip().toLowerCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .replace('ł', 'l').replace("﻿", "");
        return n.replace('_', ' ').replace('-', ' ').replaceAll("[:.]", " ").replaceAll("\\s+", " ").strip()
                .replace("e mail", "email");
    }
}

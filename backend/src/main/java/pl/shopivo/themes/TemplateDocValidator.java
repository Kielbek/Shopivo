package pl.shopivo.themes;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Checks a store's template document (which sections each page has, in which order, with which settings) against the
 * template's schemas and returns a clean copy. Same rules as the storefront engine's settings.ts — the storefront also
 * normalises on render, but only what passes here is ever stored. Messages are in Polish for the editor.
 *
 * <pre>
 * { "pages":  { "index": { "sections": { "hero": { "type": "hero", "settings": {…}, "blocks": {…}, "block_order": […] } }, "order": ["hero"] } },
 *   "groups": { "header": {…}, "footer": {…} } }
 * </pre>
 * Pages and groups left out use the template's defaults.
 */
final class TemplateDocValidator {

    static final int MAX_BYTES = 300_000;
    static final int MAX_SECTIONS = 40;
    private static final Pattern ID = Pattern.compile("^[a-z0-9][a-z0-9_-]{0,39}$");
    private static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    private static final Pattern COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Pattern ASSET = Pattern.compile("^asset:[a-z0-9][a-z0-9._-]{0,80}$", Pattern.CASE_INSENSITIVE);
    private static final Set<String> SOURCES = Set.of("newest", "bestsellers", "sale", "last_pieces", "top_rated", "back_in_stock", "category");
    private static final Pattern CONTROL = Pattern.compile("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]");

    private final TemplatePackages.Package pkg;
    private final Set<UUID> libraryImages;
    private final JsonMapper json;

    TemplateDocValidator(TemplatePackages.Package pkg, Set<UUID> libraryImages, JsonMapper json) {
        this.pkg = pkg;
        this.libraryImages = libraryImages;
        this.json = json;
    }

    /** A store-relative path, anchor, https address, e-mail/phone link or a legal page placeholder — nothing else. */
    static boolean safeLink(String v) {
        return v.matches("^/(?!/)[^\\s\\\\]*$") || v.matches("^#[A-Za-z][\\w-]*$") || v.matches("^https://[^\\s\\\\]+$")
                || v.matches("^mailto:[^\\s@]+@[^\\s@]+$") || v.matches("^tel:\\+?[\\d ()-]{3,20}$") || v.matches("^legal:(TERMS|PRIVACY|RETURNS|SHIPPING)$");
    }

    ObjectNode validate(JsonNode doc) {
        if (doc == null || !doc.isObject()) throw new IllegalArgumentException("Nieprawidłowy dokument szablonu.");
        if (json.writeValueAsString(doc).length() > MAX_BYTES) throw new IllegalArgumentException("Za dużo treści na stronach szablonu.");
        ObjectNode out = json.createObjectNode();
        ObjectNode pages = out.putObject("pages");
        ObjectNode groups = out.putObject("groups");
        for (var e : doc.path("pages").properties()) {
            if (!TemplatePackages.PAGES.contains(e.getKey())) throw new IllegalArgumentException("Nieznana strona: " + e.getKey());
            pages.set(e.getKey(), page(e.getKey(), e.getValue()));
        }
        for (var e : doc.path("groups").properties()) {
            if (!TemplatePackages.GROUPS.contains(e.getKey())) throw new IllegalArgumentException("Nieznana część strony: " + e.getKey());
            groups.set(e.getKey(), page(e.getKey(), e.getValue()));
        }
        for (String k : doc.propertyNames()) {
            if (!k.equals("pages") && !k.equals("groups")) throw new IllegalArgumentException("Nieznane pole: " + k);
        }
        return out;
    }

    /** Section types allowed on a page: its own page sections (main-…) plus every shared section; groups keep their own. */
    private Set<String> allowedTypes(String page) {
        Set<String> defaults = new HashSet<>();
        pkg.defaults().get(page).path("sections").forEach(s -> defaults.add(s.path("type").asString()));
        if (TemplatePackages.GROUPS.contains(page)) {
            // the header and footer keep their own sections, plus the shared ones (e.g. a campaign strip above the header)
            pkg.sections().values().stream().filter(TemplatePackages.Section::shared).forEach(s -> defaults.add(s.type()));
            return defaults;
        }
        Set<String> out = new HashSet<>(defaults);
        for (var s : pkg.sections().values()) {
            if (!s.main() && !s.type().equals("header") && !s.type().equals("footer")) out.add(s.type());
        }
        return out;
    }

    private ObjectNode page(String page, JsonNode doc) {
        if (!doc.isObject() || !doc.path("order").isArray() || !doc.path("sections").isObject()) {
            throw new IllegalArgumentException("Nieprawidłowy układ strony.");
        }
        Set<String> allowed = allowedTypes(page);
        ObjectNode out = json.createObjectNode();
        ObjectNode sections = out.putObject("sections");
        ArrayNode order = out.putArray("order");
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode idNode : doc.get("order")) {
            String id = idNode.asString("");
            if (!ID.matcher(id).matches() || !seen.add(id)) throw new IllegalArgumentException("Nieprawidłowy identyfikator sekcji.");
            if (seen.size() > MAX_SECTIONS) throw new IllegalArgumentException("Strona może mieć najwyżej " + MAX_SECTIONS + " sekcji.");
            JsonNode s = doc.get("sections").get(id);
            if (s == null) throw new IllegalArgumentException("Brak sekcji " + id + ".");
            String type = s.path("type").asString("");
            if (!allowed.contains(type)) throw new IllegalArgumentException("Tej sekcji nie można dodać na tej stronie.");
            sections.set(id, section(pkg.sections().get(type), s));
            order.add(id);
        }
        if (doc.get("sections").size() != seen.size()) throw new IllegalArgumentException("Sekcja spoza kolejności strony.");
        // The page's own sections (product details, cart, checkout…) stay: they are the page.
        for (JsonNode d : pkg.defaults().get(page).path("sections")) {
            String type = d.path("type").asString();
            if ((type.startsWith("main-") || TemplatePackages.GROUPS.contains(page))
                    && seen.stream().noneMatch(id -> sections.get(id).path("type").asString().equals(type))) {
                throw new IllegalArgumentException("Tej części strony nie można usunąć.");
            }
        }
        return out;
    }

    /** "Show from–to" of a section: Polish local times ("2026-11-27T00:00"); either end may be missing, from before to. */
    private ObjectNode schedule(JsonNode v) {
        if (!v.isObject()) throw new IllegalArgumentException("Nieprawidłowy harmonogram sekcji.");
        ObjectNode out = json.createObjectNode();
        java.time.LocalDateTime from = null, to = null;
        for (String k : v.propertyNames()) {
            if (!k.equals("from") && !k.equals("to")) throw new IllegalArgumentException("Nieprawidłowy harmonogram sekcji.");
            String text = v.get(k).asString("");
            if (text.isEmpty()) continue;
            java.time.LocalDateTime t = localTime(text, "Harmonogram sekcji");
            if (k.equals("from")) from = t; else to = t;
            out.put(k, text);
        }
        if (from != null && to != null && !from.isBefore(to)) throw new IllegalArgumentException("Koniec wyświetlania musi być po początku.");
        return out;
    }

    private static java.time.LocalDateTime localTime(String text, String label) {
        if (!LOCAL_TIME.matcher(text).matches()) throw new IllegalArgumentException(label + ": podaj datę i godzinę.");
        try {
            return java.time.LocalDateTime.parse(text);
        } catch (java.time.format.DateTimeParseException e) {
            throw new IllegalArgumentException(label + ": podaj datę i godzinę.");
        }
    }

    private static final Pattern LOCAL_TIME = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$");

    private ObjectNode section(TemplatePackages.Section schema, JsonNode s) {
        ObjectNode out = json.createObjectNode();
        out.put("type", schema.type());
        if (s.path("disabled").asBoolean(false)) {
            if (schema.main()) throw new IllegalArgumentException("Tej sekcji nie można ukryć.");
            out.put("disabled", true);
        }
        JsonNode schedule = s.path("schedule");
        if (!schedule.isMissingNode() && !schedule.isNull()) out.set("schedule", schedule(schedule));
        out.set("settings", settings(schema.settings(), s.path("settings")));
        JsonNode order = s.path("block_order");
        JsonNode blocks = s.path("blocks");
        if (!order.isMissingNode() || !blocks.isMissingNode()) {
            ObjectNode outBlocks = out.putObject("blocks");
            ArrayNode outOrder = out.putArray("block_order");
            Set<String> seen = new LinkedHashSet<>();
            for (JsonNode idNode : order) {
                String id = idNode.asString("");
                if (!ID.matcher(id).matches() || !seen.add(id)) throw new IllegalArgumentException("Nieprawidłowy identyfikator elementu.");
                JsonNode b = blocks.get(id);
                if (b == null) throw new IllegalArgumentException("Brak elementu " + id + ".");
                var bschema = schema.blocks().stream().filter(x -> x.type().equals(b.path("type").asString())).findFirst()
                        .orElseThrow(() -> new IllegalArgumentException("Nieznany element sekcji."));
                ObjectNode ob = outBlocks.putObject(id);
                ob.put("type", bschema.type());
                if (b.path("disabled").asBoolean(false)) ob.put("disabled", true);
                ob.set("settings", settings(bschema.settings(), b.path("settings")));
                outOrder.add(id);
            }
            if (blocks.size() != seen.size()) throw new IllegalArgumentException("Element spoza kolejności sekcji.");
            if (schema.maxBlocks() != null && seen.size() > schema.maxBlocks()) {
                throw new IllegalArgumentException("Sekcja „" + schema.name() + "” może mieć najwyżej " + schema.maxBlocks() + " elementów.");
            }
        }
        return out;
    }

    private ObjectNode settings(List<TemplatePackages.Setting> schema, JsonNode values) {
        ObjectNode out = json.createObjectNode();
        if (values.isMissingNode() || values.isNull()) return out;
        if (!values.isObject()) throw new IllegalArgumentException("Nieprawidłowe ustawienia.");
        for (String key : values.propertyNames()) {
            var s = schema.stream().filter(x -> x.id().equals(key)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Nieznane ustawienie: " + key));
            out.set(key, value(s, values.get(key)));
        }
        return out;
    }

    private JsonNode value(TemplatePackages.Setting s, JsonNode v) {
        String label = s.label().isBlank() ? s.id() : s.label();
        switch (s.type()) {
            case "text", "textarea" -> {
                if (!v.isString()) throw bad(label);
                String text = CONTROL.matcher(v.asString()).replaceAll("");
                if (s.type().equals("text")) text = text.replaceAll("[\\r\\n]+", " ");
                int max = s.max() != null ? s.max() : s.type().equals("text") ? 300 : 2000;
                if (text.length() > max) throw new IllegalArgumentException(label + ": najwyżej " + max + " znaków.");
                return json.getNodeFactory().stringNode(text);
            }
            case "url" -> {
                String u = v.isString() ? v.asString().strip() : null;
                if (u == null || (!u.isEmpty() && !safeLink(u))) {
                    throw new IllegalArgumentException(label + ": podaj adres w sklepie (zaczynający się od /) albo pełny adres https://");
                }
                return json.getNodeFactory().stringNode(u);
            }
            case "image" -> {
                String ref = v.isString() ? v.asString().strip() : null;
                if (ref == null) throw bad(label);
                if (ref.isEmpty() || ASSET.matcher(ref).matches()) return json.getNodeFactory().stringNode(ref);
                try {
                    UUID id = UUID.fromString(ref);
                    if (libraryImages.contains(id)) return json.getNodeFactory().stringNode(id.toString());
                } catch (IllegalArgumentException ignored) {
                    // falls through
                }
                throw new IllegalArgumentException(label + ": wybierz zdjęcie z biblioteki sklepu.");
            }
            case "select" -> {
                String o = v.asString("");
                if (s.options() == null || s.options().stream().noneMatch(x -> x.get("value").equals(o))) throw bad(label);
                return json.getNodeFactory().stringNode(o);
            }
            case "number" -> {
                if (!v.isNumber() || !v.canConvertToInt()) throw bad(label);
                int n = v.asInt();
                if ((s.min() != null && n < s.min()) || (s.max() != null && n > s.max())) {
                    throw new IllegalArgumentException(label + ": od " + s.min() + " do " + s.max() + ".");
                }
                return json.getNodeFactory().numberNode(n);
            }
            case "checkbox" -> {
                if (!v.isBoolean()) throw bad(label);
                return v;
            }
            case "color" -> {
                if (!v.isString() || !COLOR.matcher(v.asString()).matches()) throw new IllegalArgumentException(label + ": kolor w formacie #RRGGBB.");
                return json.getNodeFactory().stringNode(v.asString().toLowerCase(java.util.Locale.ROOT));
            }
            case "product_list" -> {
                String source = v.path("source").asString("");
                if (!SOURCES.contains(source) || !v.path("count").canConvertToInt()) throw bad(label);
                int count = v.path("count").asInt();
                if (count < 1 || count > 24) throw new IllegalArgumentException(label + ": od 1 do 24 produktów.");
                ObjectNode o = json.createObjectNode().put("source", source).put("count", count);
                String category = v.path("category").asString("");
                if (!category.isEmpty()) {
                    if (!SLUG.matcher(category).matches()) throw bad(label);
                    o.put("category", category);
                } else if (source.equals("category")) {
                    throw new IllegalArgumentException(label + ": wybierz kategorię.");
                }
                return o;
            }
            case "datetime" -> {
                String text = v.isString() ? v.asString().strip() : null;
                if (text == null) throw bad(label);
                if (!text.isEmpty()) localTime(text, label);
                return json.getNodeFactory().stringNode(text);
            }
            case "point" -> {
                // A position on a picture, in percent of its width and height (0.1 precision); null = not set
                if (v.isNull()) return v;
                if (!v.isObject() || !v.path("x").isNumber() || !v.path("y").isNumber()) throw bad(label);
                double x = v.path("x").asDouble(), y = v.path("y").asDouble();
                if (x < 0 || x > 100 || y < 0 || y > 100) throw new IllegalArgumentException(label + ": położenie od 0 do 100%.");
                return json.createObjectNode().put("x", Math.round(x * 10) / 10.0).put("y", Math.round(y * 10) / 10.0);
            }
            case "product" -> {
                String slug = v.isString() ? v.asString().strip() : null;
                if (slug == null || (!slug.isEmpty() && !SLUG.matcher(slug).matches())) throw bad(label);
                return json.getNodeFactory().stringNode(slug);
            }
            case "category_list" -> {
                String mode = v.path("mode").asString("top");
                if (mode.equals("top")) return json.createObjectNode().put("mode", "top");
                if (!mode.equals("selected") || !v.path("slugs").isArray() || v.path("slugs").size() > 24) throw bad(label);
                ObjectNode o = json.createObjectNode().put("mode", "selected");
                ArrayNode slugs = o.putArray("slugs");
                for (JsonNode x : v.path("slugs")) {
                    if (!x.isString() || !SLUG.matcher(x.asString()).matches()) throw bad(label);
                    slugs.add(x.asString());
                }
                return o;
            }
            case "link_list" -> {
                int max = s.max() != null ? s.max() : 12;
                if (!v.isArray() || v.size() > max) throw new IllegalArgumentException(label + ": najwyżej " + max + " linków.");
                ArrayNode a = json.createArrayNode();
                for (JsonNode l : v) {
                    String text = CONTROL.matcher(l.path("label").asString("")).replaceAll("").strip();
                    String url = l.path("url").asString("").strip();
                    if (text.isEmpty() || text.length() > 60 || !safeLink(url)) {
                        throw new IllegalArgumentException(label + ": każdy link potrzebuje nazwy (do 60 znaków) i poprawnego adresu.");
                    }
                    a.addObject().put("label", text).put("url", url);
                }
                return a;
            }
            default -> throw new IllegalArgumentException("Nieobsługiwany typ ustawienia: " + s.type());
        }
    }

    private static IllegalArgumentException bad(String label) {
        return new IllegalArgumentException(label + ": nieprawidłowa wartość.");
    }
}

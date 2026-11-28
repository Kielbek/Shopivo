package pl.shopivo.themes;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Schemas of the template packages (templates/&lt;name&gt;/, engine v2), read from the classpath at startup: which section
 * types exist, which settings and blocks each has, and the template's default pages. The storefront renders the same
 * packages; the backend uses them only to validate what the merchant saves and to describe the editor's forms.
 * Format: docs/TEMPLATE_FORMAT.md.
 */
@Component
public class TemplatePackages {

    private static final Logger log = LoggerFactory.getLogger(TemplatePackages.class);
    private static final Pattern SCHEMA = Pattern.compile("\\{%-?\\s*schema\\s*-?%}([\\s\\S]*?)\\{%-?\\s*endschema\\s*-?%}");
    /** Pages every package provides (same list as the storefront engine). */
    public static final List<String> PAGES = List.of("index", "catalog", "product", "cart", "favorites", "not_found", "checkout", "order",
            "page", "blog", "auth", "account", "account_order", "newsletter", "review");
    public static final List<String> GROUPS = List.of("header", "footer");

    public record Setting(String id, String type, String label, JsonNode defaultValue, String info, Integer max, Integer min,
            List<Map<String, String>> options) {
    }

    public record Block(String type, String name, List<Setting> settings) {
    }

    /** {@code shared}: from templates/_shared — offered by every template, on pages and in the header and footer. */
    public record Section(String type, String name, List<Setting> settings, List<Block> blocks, Integer maxBlocks, boolean shared) {
        /** Page sections ("main-…") belong to their page: they cannot be added, duplicated or removed in the editor. */
        public boolean main() {
            return type.startsWith("main-");
        }
    }

    /** One package: its sections and default documents (page/group name → document). */
    public record Package(String code, String name, String version, Map<String, Section> sections, Map<String, JsonNode> defaults) {
    }

    private final Map<String, Package> packages = new LinkedHashMap<>();

    TemplatePackages(JsonMapper json) {
        var resolver = new PathMatchingResourcePatternResolver();
        Map<String, Section> shared = Map.of();
        try {
            shared = sections(json, resolver, "classpath*:templates/_shared/", true);
        } catch (RuntimeException | IOException e) {
            log.error("Shared template sections skipped: {}", e.getMessage());
        }
        try {
            for (Resource manifest : resolver.getResources("classpath*:templates/*/template.json")) {
                String base = manifest.getURL().toString().replaceFirst("template\\.json$", "");
                try {
                    Package p = load(json, resolver, base, read(manifest), shared);
                    packages.put(p.code(), p);
                } catch (RuntimeException | IOException e) {
                    log.error("Template package {} skipped: {}", base, e.getMessage());
                }
            }
        } catch (IOException e) {
            log.error("Template packages could not be listed", e);
        }
    }

    private static String read(Resource r) throws IOException {
        try (InputStream in = r.getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Package load(JsonMapper json, PathMatchingResourcePatternResolver resolver, String base, String manifestText,
            Map<String, Section> shared) throws IOException {
        JsonNode manifest = json.readTree(manifestText);
        String code = manifest.get("code").asString();
        Map<String, Section> sections = new LinkedHashMap<>(sections(json, resolver, base, false));
        // A template may restyle a shared section by shipping one of the same name
        shared.forEach(sections::putIfAbsent);
        Map<String, JsonNode> defaults = new LinkedHashMap<>();
        for (String page : PAGES) defaults.put(page, json.readTree(read(resolver.getResource(base + manifest.path("pages").path(page).asString()))));
        for (String group : GROUPS) defaults.put(group, json.readTree(read(resolver.getResource(base + manifest.path("groups").path(group).asString()))));
        return new Package(code, manifest.path("name").asString(code), manifest.path("version").asString(""), Map.copyOf(sections), defaults);
    }

    private static Map<String, Section> sections(JsonMapper json, PathMatchingResourcePatternResolver resolver, String base, boolean shared)
            throws IOException {
        Map<String, Section> sections = new LinkedHashMap<>();
        for (Resource r : resolver.getResources(base + "sections/*.liquid")) {
            String file = r.getFilename();
            String type = file.substring(0, file.length() - ".liquid".length());
            Matcher m = SCHEMA.matcher(read(r));
            if (!m.find()) throw new IllegalStateException(file + ": no schema");
            JsonNode s = json.readTree(m.group(1));
            List<Block> blocks = new ArrayList<>();
            for (JsonNode b : s.path("blocks")) blocks.add(new Block(b.get("type").asString(), b.path("name").asString(""), settings(b.path("settings"))));
            sections.put(type, new Section(type, s.path("name").asString(type), settings(s.path("settings")), blocks,
                    s.has("max_blocks") ? s.get("max_blocks").asInt() : null, shared));
        }
        return sections;
    }

    private static List<Setting> settings(JsonNode list) {
        List<Setting> out = new ArrayList<>();
        for (JsonNode s : list) {
            List<Map<String, String>> options = new ArrayList<>();
            for (JsonNode o : s.path("options")) options.add(Map.of("value", o.path("value").asString(), "label", o.path("label").asString()));
            out.add(new Setting(s.get("id").asString(), s.get("type").asString(), s.path("label").asString(""), s.get("default"),
                    s.has("info") ? s.get("info").asString() : null, s.has("max") ? s.get("max").asInt() : null,
                    s.has("min") ? s.get("min").asInt() : null, options.isEmpty() ? null : options));
        }
        return out;
    }

    public Optional<Package> get(String code) {
        return Optional.ofNullable(code == null ? null : packages.get(code.toUpperCase(java.util.Locale.ROOT)));
    }

    public boolean has(String code) {
        return get(code).isPresent();
    }
}

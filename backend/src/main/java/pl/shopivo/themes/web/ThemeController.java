package pl.shopivo.themes.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.themes.ThemeRegistry;
import pl.shopivo.themes.Themes;

@RestController
@RequestMapping("/api/v1/tenants/{tenantId}/theme")
@Tag(name = "Themes")
class ThemeController {

    private final Themes themes;

    ThemeController(Themes themes) {
        this.themes = themes;
    }

    record ThemeResponse(List<ThemeRegistry.Preset> presets, List<ThemeRegistry.Field> fields, Themes.ThemeState state) {
    }

    record DraftRequest(String code, Map<String, String> settings, long version) {
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    ThemeResponse get(@PathVariable UUID tenantId) {
        return new ThemeResponse(ThemeRegistry.PRESETS, ThemeRegistry.FIELDS, themes.state());
    }

    @PutMapping
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    Themes.ThemeState save(@PathVariable UUID tenantId, @RequestBody DraftRequest request) {
        return themes.saveDraft(request.code(), request.settings(), request.version());
    }

    @PostMapping("/publish")
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    Themes.ThemeState publish(@PathVariable UUID tenantId) {
        return themes.publish();
    }
}

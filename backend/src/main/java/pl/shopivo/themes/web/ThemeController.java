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
    private final pl.shopivo.themes.ThemeImages images;
    private final pl.shopivo.themes.ThemeSamples samples;
    private final pl.shopivo.themes.ThemeUsage usage;

    ThemeController(Themes themes, pl.shopivo.themes.ThemeImages images, pl.shopivo.themes.ThemeSamples samples, pl.shopivo.themes.ThemeUsage usage) {
        this.usage = usage;
        this.themes = themes;
        this.images = images;
        this.samples = samples;
    }

    record SamplesRequest(String code) {
    }

    record SamplesResponse(int created) {
    }

    /** Adds the template's example products to the store as ordinary products (skips names that already exist). */
    @PostMapping("/sample-products")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    SamplesResponse importSamples(@PathVariable UUID tenantId, @RequestBody SamplesRequest request) {
        return new SamplesResponse(samples.importInto(request.code()));
    }

    record ThemeResponse(List<ThemeRegistry.Preset> presets, List<ThemeRegistry.Field> fields, List<pl.shopivo.themes.SectionRegistry.SectionType> sectionTypes,
            Themes.ThemeState state, List<pl.shopivo.themes.ThemeAssets.Asset> templateImages,
            Map<String, List<pl.shopivo.themes.ThemeSamples.SampleCard>> sampleProducts, Map<String, Long> usage) {
    }

    record DraftRequest(String code, Map<String, String> settings, List<pl.shopivo.themes.SectionRegistry.Section> sections, long version) {
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    ThemeResponse get(@PathVariable UUID tenantId) {
        return new ThemeResponse(ThemeRegistry.PRESETS, ThemeRegistry.FIELDS, pl.shopivo.themes.SectionRegistry.TYPES, themes.state(),
                pl.shopivo.themes.ThemeAssets.ALL, pl.shopivo.themes.ThemeSamples.cards(), usage.counts());
    }

    @PutMapping
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    Themes.ThemeState save(@PathVariable UUID tenantId, @RequestBody DraftRequest request) {
        var state = themes.saveDraft(request.code(), request.settings(), request.sections(), request.version());
        usage.refresh();
        return state;
    }

    @PostMapping("/publish")
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    Themes.ThemeState publish(@PathVariable UUID tenantId) {
        var state = themes.publish();
        usage.refresh();
        return state;
    }

    @GetMapping("/images")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    List<pl.shopivo.media.Media.ImageView> images(@PathVariable UUID tenantId) {
        return images.list();
    }

    @PostMapping(value = "/images", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    pl.shopivo.media.Media.ImageView upload(@PathVariable UUID tenantId, @org.springframework.web.bind.annotation.RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            @org.springframework.web.bind.annotation.RequestParam(value = "alt", required = false) String alt) throws java.io.IOException {
        if (file.getSize() > pl.shopivo.media.ImageProcessor.MAX_BYTES) {
            throw new pl.shopivo.shared.error.BusinessRuleException("FILE_TOO_LARGE", "Zdjęcie może mieć najwyżej 10 MB.");
        }
        return images.upload(file.getBytes(), alt);
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/images/{imageId}")
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    void deleteImage(@PathVariable UUID tenantId, @PathVariable UUID imageId) {
        images.delete(imageId);
    }
}

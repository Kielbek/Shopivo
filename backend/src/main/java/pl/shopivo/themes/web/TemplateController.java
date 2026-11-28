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
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.themes.TemplateDocs;
import pl.shopivo.themes.TemplatePackages;
import pl.shopivo.themes.ThemeUsage;
import tools.jackson.databind.JsonNode;

/** Editor of a template package (engine v2): the template's schemas, the store's draft, publishing and earlier versions. */
@RestController
@RequestMapping("/api/v1/tenants/{tenantId}/template")
@Tag(name = "Themes")
class TemplateController {

    private final TemplateDocs docs;
    private final TemplatePackages packages;
    private final ThemeUsage usage;

    TemplateController(TemplateDocs docs, TemplatePackages packages, ThemeUsage usage) {
        this.docs = docs;
        this.packages = packages;
        this.usage = usage;
    }

    /** Everything the editor needs: section schemas (forms), template defaults (pages left as they come) and the store's state. */
    record TemplateResponse(String code, String name, String templateVersion, Map<String, TemplatePackages.Section> sections,
            Map<String, JsonNode> defaults, TemplateDocs.State state, List<TemplateDocs.VersionView> versions) {
    }

    record DraftRequest(JsonNode doc, long version) {
    }

    record RestoreRequest(long version) {
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    TemplateResponse get(@PathVariable UUID tenantId) {
        TemplateDocs.State state = docs.state();
        TemplatePackages.Package p = packages.get(state.code()).orElseThrow(NotFoundException::new);
        return new TemplateResponse(p.code(), p.name(), p.version(), p.sections(), p.defaults(), state, docs.versions());
    }

    @PutMapping("/draft")
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    TemplateDocs.State save(@PathVariable UUID tenantId, @RequestBody DraftRequest request) {
        return docs.saveDraft(request.doc(), request.version());
    }

    @PostMapping("/publish")
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    TemplateDocs.State publish(@PathVariable UUID tenantId) {
        var state = docs.publish(SecurityUtils.requireUser().id());
        usage.refresh();
        return state;
    }

    @PostMapping("/versions/{versionId}/restore")
    @PreAuthorize("@tenantAccess.can('THEMES_WRITE')")
    TemplateDocs.State restore(@PathVariable UUID tenantId, @PathVariable UUID versionId, @RequestBody RestoreRequest request) {
        return docs.restore(versionId, request.version());
    }
}

package pl.shopivo.content.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.content.Content;
import pl.shopivo.content.ContentKind;
import pl.shopivo.content.LegalKey;
import pl.shopivo.content.Redirects;
import pl.shopivo.shared.web.PageResponse;

@RestController
@RequestMapping("/api/v1/tenants/{tenantId}")
@Tag(name = "Content")
class ContentController {

    private final Content content;
    private final Redirects redirects;
    private final pl.shopivo.content.PublicContent publicContent;
    private final pl.shopivo.content.Navigation navigation;
    private final pl.shopivo.content.LegalSettings legalSettings;

    ContentController(Content content, Redirects redirects, pl.shopivo.content.PublicContent publicContent,
            pl.shopivo.content.Navigation navigation, pl.shopivo.content.LegalSettings legalSettings) {
        this.legalSettings = legalSettings;
        this.navigation = navigation;
        this.publicContent = publicContent;
        this.content = content;
        this.redirects = redirects;
    }

    @GetMapping("/content")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    PageResponse<Content.EntrySummary> list(@PathVariable UUID tenantId, @RequestParam ContentKind kind,
            @RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(content.list(kind, q, PageRequest.of(Math.clamp(page, 0, 1000), Math.clamp(size, 1, 100))), e -> e);
    }

    record LegalStatus(LegalKey key, String title, boolean requiredForPublish, Content.EntrySummary entry, List<String> missing) {
    }

    record LegalTemplate(LegalKey key, String body, List<String> missing) {
    }

    @GetMapping("/content/legal")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    List<LegalStatus> legal(@PathVariable UUID tenantId) {
        Map<LegalKey, java.util.Optional<Content.EntrySummary>> status = content.legalStatus();
        Map<LegalKey, List<String>> missing = content.legalMissing();
        return java.util.Arrays.stream(LegalKey.values())
                .map(k -> new LegalStatus(k, k.title(), k.requiredForPublish(), status.get(k).orElse(null), missing.getOrDefault(k, List.of()))).toList();
    }

    @GetMapping("/content/legal/settings")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    pl.shopivo.content.LegalSettings.View legalSettings(@PathVariable UUID tenantId) {
        return legalSettings.current();
    }

    @PutMapping("/content/legal/settings")
    @PreAuthorize("@tenantAccess.can('CONTENT_WRITE')")
    pl.shopivo.content.LegalSettings.View saveLegalSettings(@PathVariable UUID tenantId, @RequestBody pl.shopivo.content.LegalSettings.View input) {
        return legalSettings.save(input);
    }

    @GetMapping("/content/legal/{key}/template")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    LegalTemplate legalTemplate(@PathVariable UUID tenantId, @PathVariable LegalKey key) {
        String body = content.legalTemplate(key);
        return new LegalTemplate(key, body, pl.shopivo.content.LegalSettings.missing(body));
    }

    @PostMapping("/content/legal/{key}")
    @PreAuthorize("@tenantAccess.can('CONTENT_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    Content.EntryView createLegal(@PathVariable UUID tenantId, @PathVariable LegalKey key) {
        return content.createLegal(key);
    }

    @GetMapping("/content/{id}")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    Content.EntryView get(@PathVariable UUID tenantId, @PathVariable UUID id) {
        return content.get(id);
    }

    @PostMapping("/content")
    @PreAuthorize("@tenantAccess.can('CONTENT_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    Content.EntryView create(@PathVariable UUID tenantId, @RequestBody Content.EntryInput input) {
        return content.create(input);
    }

    @PutMapping("/content/{id}")
    @PreAuthorize("@tenantAccess.can('CONTENT_WRITE')")
    Content.EntryView update(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody Content.EntryInput input) {
        return content.update(id, input);
    }

    @DeleteMapping("/content/{id}")
    @PreAuthorize("@tenantAccess.can('CONTENT_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID tenantId, @PathVariable UUID id) {
        content.delete(id);
    }

    /** Exact text of a published revision — e.g. the terms a customer accepted with an order. */
    @GetMapping("/content/revisions/{revisionId}")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ') or @tenantAccess.can('CONTENT_WRITE')")
    pl.shopivo.content.PublicContent.PublicEntry revision(@PathVariable UUID tenantId, @PathVariable UUID revisionId) {
        return publicContent.revision(revisionId).orElseThrow(() -> new pl.shopivo.shared.error.NotFoundException("Nie znaleziono wersji."));
    }

    // ------------------------------------------------------------------------------------------------ navigation

    @GetMapping("/navigation")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    pl.shopivo.content.Navigation.Menu navigation(@PathVariable UUID tenantId) {
        return navigation.state();
    }

    record NavigationRequest(List<pl.shopivo.content.Navigation.Item> items, long version) {
    }

    @PutMapping("/navigation")
    @PreAuthorize("@tenantAccess.can('CONTENT_WRITE')")
    pl.shopivo.content.Navigation.Menu saveNavigation(@PathVariable UUID tenantId, @RequestBody NavigationRequest request) {
        return navigation.save(request.items(), request.version());
    }

    // ------------------------------------------------------------------------------------------------ redirects

    @GetMapping("/redirects")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    List<Redirects.RedirectView> redirects(@PathVariable UUID tenantId) {
        return redirects.list();
    }

    record RedirectRequest(String fromPath, String toPath) {
    }

    @PostMapping("/redirects")
    @PreAuthorize("@tenantAccess.can('SEO_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    Redirects.RedirectView addRedirect(@PathVariable UUID tenantId, @RequestBody RedirectRequest request) {
        return redirects.add(request.fromPath(), request.toPath());
    }

    @DeleteMapping("/redirects/{id}")
    @PreAuthorize("@tenantAccess.can('SEO_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteRedirect(@PathVariable UUID tenantId, @PathVariable UUID id) {
        redirects.delete(id);
    }
}

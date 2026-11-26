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

    ContentController(Content content, Redirects redirects, pl.shopivo.content.PublicContent publicContent) {
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

    record LegalStatus(LegalKey key, String title, boolean requiredForPublish, Content.EntrySummary entry) {
    }

    @GetMapping("/content/legal")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    List<LegalStatus> legal(@PathVariable UUID tenantId) {
        Map<LegalKey, java.util.Optional<Content.EntrySummary>> status = content.legalStatus();
        return java.util.Arrays.stream(LegalKey.values())
                .map(k -> new LegalStatus(k, k.title(), k.requiredForPublish(), status.get(k).orElse(null))).toList();
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

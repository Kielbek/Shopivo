package pl.shopivo.reviews.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.reviews.Reviews;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.web.PageResponse;

@RestController
@RequestMapping("/api/v1/tenants/{tenantId}/reviews")
@Tag(name = "Reviews")
class ReviewController {

    private final Reviews reviews;

    ReviewController(Reviews reviews) {
        this.reviews = reviews;
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    PageResponse<Reviews.ReviewView> list(@PathVariable UUID tenantId, @RequestParam(required = false) Reviews.Status status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(reviews.list(status, PageRequest.of(Math.clamp(page, 0, 1000), Math.clamp(size, 1, 100))), r -> r);
    }

    @GetMapping("/pending-count")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    Map<String, Long> pending(@PathVariable UUID tenantId) {
        return Map.of("count", reviews.pendingCount());
    }

    record ModerationRequest(Reviews.Status status) {
    }

    @PostMapping("/{id}/moderation")
    @PreAuthorize("@tenantAccess.can('CONTENT_WRITE')")
    Reviews.ReviewView moderate(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody ModerationRequest request) {
        return reviews.moderate(id, request.status(), SecurityUtils.currentUser().map(u -> u.id()).orElse(null));
    }

    record ReplyRequest(String reply) {
    }

    @PutMapping("/{id}/reply")
    @PreAuthorize("@tenantAccess.can('CONTENT_WRITE')")
    Reviews.ReviewView reply(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody ReplyRequest request) {
        return reviews.reply(id, request.reply());
    }
}

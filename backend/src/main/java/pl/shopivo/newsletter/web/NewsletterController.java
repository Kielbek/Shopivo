package pl.shopivo.newsletter.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.newsletter.Newsletter;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.ApiException;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.web.PageResponse;
import pl.shopivo.stores.StorefrontTenants;

@RestController
@Tag(name = "Newsletter")
class NewsletterController {

    private final Newsletter newsletter;
    private final StorefrontTenants storefront;
    private final RateLimiter rateLimiter;

    NewsletterController(Newsletter newsletter, StorefrontTenants storefront, RateLimiter rateLimiter) {
        this.newsletter = newsletter;
        this.storefront = storefront;
        this.rateLimiter = rateLimiter;
    }

    record EmailRequest(String email) {
    }

    record TokenRequest(String token) {
    }

    // ------------------------------------------------------------------------------------------------ storefront

    /** Always 202: the answer does not reveal whether an address is subscribed. */
    @PostMapping("/api/v1/storefront/newsletter")
    ResponseEntity<Void> subscribe(HttpServletRequest request, @RequestBody EmailRequest body) {
        UUID tenant = guard(request);
        rateLimiter.consume("nl-ip:" + request.getRemoteAddr(), 10, Duration.ofMinutes(10));
        String email = body.email() == null ? "" : body.email().strip().toLowerCase(Locale.ROOT);
        rateLimiter.consume("nl-email:" + tenant + ":" + Tokens.sha256(email), 3, Duration.ofHours(1));
        TenantContext.runInTenant(tenant, () -> newsletter.subscribe(body.email(), "storefront"));
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/api/v1/storefront/newsletter/confirm")
    ResponseEntity<Void> confirm(HttpServletRequest request, @RequestBody TokenRequest body) {
        UUID tenant = guard(request);
        rateLimiter.consume("nl-confirm:" + request.getRemoteAddr(), 30, Duration.ofMinutes(10));
        TenantContext.runInTenant(tenant, () -> newsletter.confirm(body.token()));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/api/v1/storefront/newsletter/unsubscribe")
    ResponseEntity<Void> unsubscribe(HttpServletRequest request, @RequestBody TokenRequest body) {
        UUID tenant = guard(request);
        rateLimiter.consume("nl-unsub:" + request.getRemoteAddr(), 30, Duration.ofMinutes(10));
        TenantContext.runInTenant(tenant, () -> newsletter.unsubscribe(body.token()));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    private UUID guard(HttpServletRequest request) {
        if (!"shopivo".equals(request.getHeader("X-Requested-With"))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MISSING_HEADER", "Brak wymaganego nagłówka żądania.");
        }
        return storefront.resolvePublished(request);
    }

    // ------------------------------------------------------------------------------------------------ panel

    record Overview(Map<Newsletter.Status, Long> counts) {
    }

    @GetMapping("/api/v1/tenants/{tenantId}/newsletter")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_READ')")
    PageResponse<Newsletter.Subscriber> list(@PathVariable UUID tenantId, @RequestParam(required = false) Newsletter.Status status,
            @RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(newsletter.list(status, q, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))), s -> s);
    }

    @GetMapping("/api/v1/tenants/{tenantId}/newsletter/summary")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_READ')")
    Overview summary(@PathVariable UUID tenantId) {
        return new Overview(newsletter.counts());
    }

    @GetMapping("/api/v1/tenants/{tenantId}/newsletter/export.csv")
    @PreAuthorize("@tenantAccess.can('MARKETING_WRITE')")
    ResponseEntity<byte[]> export(@PathVariable UUID tenantId) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("newsletter-" + LocalDate.now() + ".csv").build().toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(newsletter.exportConfirmedCsv(SecurityUtils.requireUser().id()).getBytes(StandardCharsets.UTF_8));
    }

    @DeleteMapping("/api/v1/tenants/{tenantId}/newsletter/{id}")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID tenantId, @PathVariable UUID id) {
        newsletter.delete(id);
    }
}

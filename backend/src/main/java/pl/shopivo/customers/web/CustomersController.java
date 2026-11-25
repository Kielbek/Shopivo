package pl.shopivo.customers.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.customers.Customers;
import pl.shopivo.customers.Customers.CustomerView;
import pl.shopivo.shared.web.PageResponse;

@RestController
@RequestMapping("/api/v1/tenants/{tenantId}/customers")
@Tag(name = "Customers")
class CustomersController {

    private final Customers customers;

    CustomersController(Customers customers) {
        this.customers = customers;
    }

    record NoteRequest(@Size(max = 2000) String note, long version) {
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_READ')")
    PageResponse<CustomerView> list(@PathVariable UUID tenantId, @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean marketing, @RequestParam(required = false) Customers.Sort sort,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(customers.search(q, marketing, sort, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))), c -> c);
    }

    @GetMapping("/{id}")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_READ')")
    CustomerView get(@PathVariable UUID tenantId, @PathVariable UUID id) {
        return customers.get(id);
    }

    @PatchMapping("/{id}/note")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_WRITE')")
    CustomerView note(@PathVariable UUID tenantId, @PathVariable UUID id, @Valid @RequestBody NoteRequest request) {
        return customers.updateNote(id, request.note(), request.version());
    }

    /** Contacts with marketing consent only (RODO: no export of people who did not agree). */
    @GetMapping("/marketing-export.csv")
    @PreAuthorize("@tenantAccess.can('MARKETING_WRITE')")
    ResponseEntity<byte[]> export(@PathVariable UUID tenantId) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("zgody-marketingowe-" + LocalDate.now() + ".csv").build().toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(customers.exportMarketingCsv().getBytes(StandardCharsets.UTF_8));
    }
}

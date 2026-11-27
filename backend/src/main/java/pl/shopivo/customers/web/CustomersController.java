package pl.shopivo.customers.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
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

    record UpdateRequest(@Valid Customers.CustomerInput customer, long version) {
    }

    record TagRequest(@Size(min = 1, max = 500) List<UUID> ids, @Size(max = 40) String tag) {
    }

    record ExportRequest(@Size(max = 500) List<UUID> ids) {
    }

    record TagResult(int changed) {
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_READ')")
    PageResponse<CustomerView> list(@PathVariable UUID tenantId, @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean marketing, @RequestParam(required = false) String tag,
            @RequestParam(required = false) Customers.Sort sort,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(customers.search(q, marketing, tag, sort, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))), c -> c);
    }

    @PostMapping
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_WRITE')")
    ResponseEntity<CustomerView> create(@PathVariable UUID tenantId, @RequestBody Customers.CustomerInput request) {
        return ResponseEntity.status(201).body(customers.create(request));
    }

    @GetMapping("/tags")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_READ')")
    List<String> tags(@PathVariable UUID tenantId) {
        return customers.tags();
    }

    @PostMapping("/tags")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_WRITE')")
    TagResult addTag(@PathVariable UUID tenantId, @Valid @RequestBody TagRequest request) {
        return new TagResult(customers.addTag(request.ids() == null ? List.of() : request.ids(), request.tag()));
    }

    /** Whole list, or the selected customers ({@code ids}). Personal data: write permission, audited. */
    @PostMapping("/export.csv")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_WRITE')")
    ResponseEntity<byte[]> exportAll(@PathVariable UUID tenantId, @Valid @RequestBody(required = false) ExportRequest request) {
        return csv("klienci-" + LocalDate.now() + ".csv", customers.exportCsv(request == null ? List.of() : request.ids()));
    }

    @PostMapping("/import")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_WRITE')")
    Customers.ImportResult importCsv(@PathVariable UUID tenantId, @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "false") boolean consentConfirmed) throws java.io.IOException {
        if (file.getSize() > 5L * 1024 * 1024) {
            throw new pl.shopivo.shared.error.BusinessRuleException("IMPORT_TOO_LARGE", "Plik jest za duży (maks. 5 MB).");
        }
        return customers.importCsv(new String(file.getBytes(), StandardCharsets.UTF_8), consentConfirmed);
    }

    @GetMapping("/{id}")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_READ')")
    CustomerView get(@PathVariable UUID tenantId, @PathVariable UUID id) {
        return customers.get(id);
    }

    @PutMapping("/{id}")
    @PreAuthorize("@tenantAccess.can('CUSTOMERS_WRITE')")
    CustomerView update(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody UpdateRequest request) {
        return customers.update(id, request.customer(), request.version());
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
        return csv("zgody-marketingowe-" + LocalDate.now() + ".csv", customers.exportMarketingCsv());
    }

    private static ResponseEntity<byte[]> csv(String name, String body) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(name).build().toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(body.getBytes(StandardCharsets.UTF_8));
    }
}

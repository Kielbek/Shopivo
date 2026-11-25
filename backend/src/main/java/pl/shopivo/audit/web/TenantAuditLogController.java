package pl.shopivo.audit.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.audit.AuditLogView;
import pl.shopivo.shared.web.PageResponse;

@RestController
@RequestMapping("/api/v1/tenants/{tenantId}/audit-logs")
@Tag(name = "Audit")
class TenantAuditLogController {

    private final AuditLog auditLog;

    TenantAuditLogController(AuditLog auditLog) {
        this.auditLog = auditLog;
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('AUDIT_READ')")
    PageResponse<AuditLogView> list(@PathVariable UUID tenantId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        var result = auditLog.tenantEntries(PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100)));
        return PageResponse.of(result, v -> v);
    }
}

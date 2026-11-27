package pl.shopivo.orders.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.orders.Returns;
import pl.shopivo.orders.Returns.ReturnView;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.web.PageResponse;

/** Returns and complaints submitted by customers: list, accept/reject, complete. */
@RestController
@RequestMapping("/api/v1/tenants/{tenantId}/returns")
@Tag(name = "Returns")
class ReturnsController {

    private final Returns returns;

    ReturnsController(Returns returns) {
        this.returns = returns;
    }

    record DecisionRequest(boolean accept, @Size(max = 2000) String note, long version) {
    }

    record CompleteRequest(@Size(max = 2000) String note, long version) {
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    PageResponse<ReturnView> list(@PathVariable UUID tenantId, @RequestParam(required = false) Returns.Status status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(returns.list(status, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))), r -> r);
    }

    @GetMapping("/open-count")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    Map<String, Long> openCount(@PathVariable UUID tenantId) {
        return Map.of("count", returns.openCount());
    }

    @GetMapping("/{id}")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    ReturnView get(@PathVariable UUID tenantId, @PathVariable UUID id) {
        return returns.get(id);
    }

    @PostMapping("/{id}/decision")
    @PreAuthorize("@tenantAccess.can('ORDERS_WRITE')")
    ReturnView decide(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody @jakarta.validation.Valid DecisionRequest body) {
        return returns.decide(id, body.accept(), body.note(), body.version(), SecurityUtils.requireUser().id());
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("@tenantAccess.can('ORDERS_WRITE')")
    ReturnView complete(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody @jakarta.validation.Valid CompleteRequest body) {
        return returns.complete(id, body.note(), body.version(), SecurityUtils.requireUser().id());
    }
}

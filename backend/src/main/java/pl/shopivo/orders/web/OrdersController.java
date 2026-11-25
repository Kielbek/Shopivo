package pl.shopivo.orders.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
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
import pl.shopivo.orders.OrderModel.OrderRow;
import pl.shopivo.orders.OrderModel.OrderStats;
import pl.shopivo.orders.OrderModel.OrderStatus;
import pl.shopivo.orders.OrderModel.OrderView;
import pl.shopivo.orders.OrderModel.PaymentSettingsView;
import pl.shopivo.orders.OrderModel.PaymentStatus;
import pl.shopivo.orders.OrderModel.ShippingMethodView;
import pl.shopivo.orders.OrderPlacement;
import pl.shopivo.orders.Orders;
import pl.shopivo.orders.PaymentSettings;
import pl.shopivo.orders.ShippingMethods;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.web.PageResponse;

@RestController
@RequestMapping("/api/v1/tenants/{tenantId}")
@Tag(name = "Orders")
class OrdersController {

    private final Orders orders;
    private final OrderPlacement placement;
    private final ShippingMethods shipping;
    private final PaymentSettings payments;

    OrdersController(Orders orders, OrderPlacement placement, ShippingMethods shipping, PaymentSettings payments) {
        this.orders = orders;
        this.placement = placement;
        this.shipping = shipping;
        this.payments = payments;
    }

    record StatusRequest(@NotNull OrderStatus status, @Size(max = 80) String trackingNumber, @Size(max = 300) String reason, long version) {
    }

    record VersionRequest(long version) {
    }

    record NoteRequest(@Size(max = 1000) String message) {
    }

    record ManualOrderRequest(@NotNull @Size(min = 1, max = 100) List<OrderPlacement.LineInput> lines,
            @NotNull OrderPlacement.CustomerInput customer) {
    }

    record DailyPoint(LocalDate day, long orders, long revenueMinor) {
    }

    @GetMapping("/orders")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    PageResponse<OrderRow> list(@PathVariable UUID tenantId, @RequestParam(required = false) String q,
            @RequestParam(required = false) OrderStatus status, @RequestParam(required = false) PaymentStatus paymentStatus,
            @RequestParam(required = false) UUID customerId, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(orders.search(q, status, paymentStatus, customerId,
                PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))), r -> r);
    }

    @GetMapping("/orders/stats")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    OrderStats stats(@PathVariable UUID tenantId) {
        return orders.stats();
    }

    @GetMapping("/orders/daily")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    List<DailyPoint> daily(@PathVariable UUID tenantId, @RequestParam(defaultValue = "30") int days) {
        return orders.daily(Math.clamp(days, 1, 366)).entrySet().stream()
                .map(e -> new DailyPoint(e.getKey(), e.getValue()[0], e.getValue()[1])).toList();
    }

    @GetMapping("/orders/{id}")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    OrderView get(@PathVariable UUID tenantId, @PathVariable UUID id) {
        return orders.get(id);
    }

    @PostMapping("/orders")
    @PreAuthorize("@tenantAccess.can('ORDERS_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    OrderView create(@PathVariable UUID tenantId, @Valid @RequestBody ManualOrderRequest request) {
        var placed = placement.manual(request.lines(), request.customer(), SecurityUtils.requireUser().id());
        return orders.get(placed.orderId());
    }

    @PostMapping("/orders/{id}/status")
    @PreAuthorize("@tenantAccess.can('ORDERS_WRITE')")
    OrderView status(@PathVariable UUID tenantId, @PathVariable UUID id, @Valid @RequestBody StatusRequest request) {
        return orders.changeStatus(id, request.status(), request.trackingNumber(), request.reason(), request.version(),
                SecurityUtils.requireUser().id());
    }

    @PostMapping("/orders/{id}/paid")
    @PreAuthorize("@tenantAccess.can('ORDERS_WRITE')")
    OrderView paid(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody VersionRequest request) {
        return orders.markPaid(id, request.version(), SecurityUtils.requireUser().id());
    }

    @PostMapping("/orders/{id}/refunded")
    @PreAuthorize("@tenantAccess.can('ORDERS_WRITE')")
    OrderView refunded(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody VersionRequest request) {
        return orders.markRefunded(id, request.version(), SecurityUtils.requireUser().id());
    }

    @PostMapping("/orders/{id}/notes")
    @PreAuthorize("@tenantAccess.can('ORDERS_WRITE')")
    OrderView note(@PathVariable UUID tenantId, @PathVariable UUID id, @Valid @RequestBody NoteRequest request) {
        return orders.addNote(id, request.message(), SecurityUtils.requireUser().id());
    }

    // ---------------------------------------------------------------- shipping & payment configuration

    @GetMapping("/shipping-methods")
    @PreAuthorize("@tenantAccess.can('ORDERS_READ')")
    List<ShippingMethodView> shippingMethods(@PathVariable UUID tenantId) {
        return shipping.list(false);
    }

    @PostMapping("/shipping-methods")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    ShippingMethodView createShipping(@PathVariable UUID tenantId, @RequestBody ShippingMethods.ShippingInput input) {
        return shipping.create(input);
    }

    @PutMapping("/shipping-methods/{id}")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    ShippingMethodView updateShipping(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody ShippingMethods.ShippingInput input) {
        return shipping.update(id, input);
    }

    @DeleteMapping("/shipping-methods/{id}")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteShipping(@PathVariable UUID tenantId, @PathVariable UUID id) {
        shipping.delete(id);
    }

    @GetMapping("/payment-settings")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    PaymentSettingsView paymentSettings(@PathVariable UUID tenantId) {
        return payments.current();
    }

    @PutMapping("/payment-settings")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    PaymentSettingsView updatePayments(@PathVariable UUID tenantId, @RequestBody PaymentSettingsView input) {
        return payments.update(input);
    }
}

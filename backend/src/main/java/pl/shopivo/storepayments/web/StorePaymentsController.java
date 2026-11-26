package pl.shopivo.storepayments.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.payments.InvalidNotificationException;
import pl.shopivo.payments.PaymentGatewayModels.InboundNotification;
import pl.shopivo.payments.PaymentGatewayModels.NotificationAck;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.storepayments.StorePaymentNotifications;
import pl.shopivo.storepayments.StorePaymentProviders;

@RestController
@Tag(name = "Store payments")
class StorePaymentsController {

    private final StorePaymentProviders providers;
    private final StorePaymentNotifications notifications;
    private final RateLimiter rateLimiter;

    StorePaymentsController(StorePaymentProviders providers, StorePaymentNotifications notifications, RateLimiter rateLimiter) {
        this.providers = providers;
        this.notifications = notifications;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/api/v1/tenants/{tenantId}/online-payments")
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    StorePaymentProviders.Overview overview(@PathVariable UUID tenantId) {
        return providers.overview();
    }

    @PutMapping("/api/v1/tenants/{tenantId}/online-payments")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    StorePaymentProviders.ProviderState save(@PathVariable UUID tenantId, @RequestBody StorePaymentProviders.SaveInput input) {
        return providers.save(input);
    }

    @PostMapping("/api/v1/tenants/{tenantId}/online-payments/test")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    StorePaymentProviders.ProviderState test(@PathVariable UUID tenantId) {
        return providers.test();
    }

    record EnabledRequest(boolean enabled) {
    }

    @PostMapping("/api/v1/tenants/{tenantId}/online-payments/enabled")
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    StorePaymentProviders.ProviderState enable(@PathVariable UUID tenantId, @RequestBody EnabledRequest request) {
        return providers.setEnabled(request.enabled());
    }

    /** Operator notifications. No session/CSRF: authenticity = signature with the store's own operator secret. */
    @PostMapping("/api/v1/webhooks/store-payments/{tenantId}/{provider}")
    ResponseEntity<String> notification(@PathVariable UUID tenantId, @PathVariable String provider, @RequestBody(required = false) String body,
            HttpServletRequest request) {
        rateLimiter.consume("store-payment-webhook:" + request.getRemoteAddr(), 600, java.time.Duration.ofMinutes(1));
        Map<String, String> headers = Collections.list(request.getHeaderNames()).stream()
                .collect(Collectors.toMap(h -> h.toLowerCase(Locale.ROOT), request::getHeader, (a, b) -> a));
        NotificationAck ack = notifications.receive(tenantId, provider, new InboundNotification(body == null ? "" : body, headers,
                request.getContentType()));
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(ack.contentType())).body(ack.body());
    }

    @ExceptionHandler(InvalidNotificationException.class)
    ResponseEntity<String> invalid() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).contentType(MediaType.TEXT_PLAIN).body("INVALID");
    }
}

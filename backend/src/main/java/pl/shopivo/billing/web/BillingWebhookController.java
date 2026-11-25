package pl.shopivo.billing.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.billing.internal.WebhookIngestion;
import pl.shopivo.payments.InvalidNotificationException;
import pl.shopivo.payments.PaymentGatewayModels.InboundNotification;
import pl.shopivo.payments.PaymentGatewayModels.NotificationAck;

/** Payment operator notifications for subscription payments. No session/CSRF — authenticity = operator signature. */
@RestController
@Tag(name = "Webhooks")
class BillingWebhookController {

    private final WebhookIngestion ingestion;

    BillingWebhookController(WebhookIngestion ingestion) {
        this.ingestion = ingestion;
    }

    @PostMapping("/api/v1/webhooks/billing/{provider}")
    ResponseEntity<String> receive(@PathVariable String provider, @RequestBody(required = false) String body,
            HttpServletRequest request) {
        Map<String, String> headers = Collections.list(request.getHeaderNames()).stream()
                .collect(Collectors.toMap(h -> h.toLowerCase(Locale.ROOT), request::getHeader, (a, b) -> a));
        NotificationAck ack = ingestion.receive(provider,
                new InboundNotification(body == null ? "" : body, headers, request.getContentType()));
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(ack.contentType())).body(ack.body());
    }

    @ExceptionHandler(InvalidNotificationException.class)
    ResponseEntity<String> invalid() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).contentType(MediaType.TEXT_PLAIN).body("INVALID");
    }
}

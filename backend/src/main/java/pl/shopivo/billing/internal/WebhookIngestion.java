package pl.shopivo.billing.internal;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.billing.BillingEventHandler;
import pl.shopivo.payments.InvalidNotificationException;
import pl.shopivo.payments.PaymentGateway;
import pl.shopivo.payments.PaymentGatewayModels.InboundNotification;
import pl.shopivo.payments.PaymentGatewayModels.NotificationAck;
import pl.shopivo.payments.PaymentGatewayModels.PaymentNotification;
import pl.shopivo.payments.PaymentGateways;
import pl.shopivo.shared.error.NotFoundException;

/**
 * Operator notification pipeline: verify (signature + operator confirmation) → record (provider, event key) for
 * idempotency → hand over to the subscriptions module → mark processed. Failures are stored and retried; the
 * operator also retries because we answer with an error status.
 */
@Service
public class WebhookIngestion {

    private static final Logger log = LoggerFactory.getLogger(WebhookIngestion.class);
    private static final int MAX_ATTEMPTS = 8;

    private final PlatformProviderRepository providers;
    private final ProviderCredentials credentials;
    private final PaymentGateways gateways;
    private final WebhookEventRepository events;
    private final ObjectProvider<BillingEventHandler> handler;
    private final TransactionTemplate tx;
    private final AuditLog auditLog;

    WebhookIngestion(PlatformProviderRepository providers, ProviderCredentials credentials, PaymentGateways gateways,
            WebhookEventRepository events, ObjectProvider<BillingEventHandler> handler, TransactionTemplate tx,
            AuditLog auditLog) {
        this.providers = providers;
        this.credentials = credentials;
        this.gateways = gateways;
        this.events = events;
        this.handler = handler;
        this.tx = tx;
        this.auditLog = auditLog;
    }

    public NotificationAck receive(String providerId, InboundNotification inbound) {
        PaymentGateway gateway = gateways.find(providerId).orElseThrow(NotFoundException::new);
        PlatformProviderEntity provider = tx.execute(s -> providers.findById(providerId).orElse(null));
        if (provider == null || !provider.isEnabled()) {
            throw new NotFoundException();
        }
        PaymentNotification notification;
        try {
            notification = gateway.handleNotification(credentials.context(provider), inbound);
        } catch (InvalidNotificationException e) {
            log.warn("Rejected {} notification: {}", providerId, e.getMessage());
            auditLog.recordSystem(AuditEntry.platform("billing.webhook.rejected", "payment_provider", providerId)
                    .with(Map.of("reason", e.getMessage())));
            throw e;
        }
        WebhookEventEntity event;
        try {
            event = tx.execute(s -> events.findByProviderAndEventId(providerId, notification.eventKey())
                    .orElseGet(() -> events.saveAndFlush(new WebhookEventEntity(providerId, notification.eventKey(),
                            notification.status().name(), inbound.body()))));
        } catch (DataIntegrityViolationException concurrentDuplicate) {
            log.info("Concurrent duplicate notification {} {}", providerId, notification.eventKey());
            return gateway.acknowledgement();
        }
        if ("PROCESSED".equals(event.getStatus())) {
            return gateway.acknowledgement(); // duplicate delivery
        }
        dispatch(providerId, notification, event.getId());
        return gateway.acknowledgement();
    }

    private void dispatch(String providerId, PaymentNotification notification, java.util.UUID eventId) {
        try {
            BillingEventHandler h = handler.getIfAvailable();
            if (h != null) h.onPaymentNotification(providerId, notification);
            tx.executeWithoutResult(s -> events.findById(eventId).ifPresent(WebhookEventEntity::processed));
        } catch (RuntimeException e) {
            log.error("Processing {} notification {} failed", providerId, notification.eventKey(), e);
            tx.executeWithoutResult(s -> events.findById(eventId).ifPresent(ev -> ev.failed(e.getMessage())));
            throw e;
        }
    }

    /** Re-processes stored notifications whose handling failed (e.g. database outage). */
    @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT3M")
    @SchedulerLock(name = "billing.webhook.retry", lockAtMostFor = "PT4M")
    public void retryFailed() {
        for (WebhookEventEntity event : tx.execute(s -> events.findRetryable(MAX_ATTEMPTS))) {
            try {
                PlatformProviderEntity provider = tx.execute(s -> providers.findById(event.getProvider()).orElseThrow());
                PaymentGateway gateway = gateways.get(event.getProvider());
                PaymentNotification n = gateway.handleNotification(credentials.context(provider),
                        new InboundNotification(event.getPayload(), Map.of(), null));
                dispatch(event.getProvider(), n, event.getId());
            } catch (RuntimeException e) {
                log.warn("Retry of webhook {} failed: {}", event.getId(), e.getMessage());
            }
        }
    }

    @Scheduled(cron = "0 41 4 * * *")
    @SchedulerLock(name = "billing.webhook.cleanup", lockAtMostFor = "PT10M")
    public void cleanup() {
        tx.executeWithoutResult(s -> events.deleteProcessedBefore(Instant.now().minus(Duration.ofDays(90))));
    }
}

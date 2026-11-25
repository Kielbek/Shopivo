package pl.shopivo.subscriptions.internal;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Supplier;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.subscriptions.BillingProperties;

/**
 * Drives time-based transitions: trial notices and expiry, renewal charges, period end (renew / cancel / grace),
 * grace expiry and payment reminders. Candidates are found in system context; each tenant is then processed in its
 * own context and transaction, so one failure does not stop the others. All steps are idempotent.
 */
@Component
public class SubscriptionLifecycleJob {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionLifecycleJob.class);

    private final SubscriptionRepository subscriptions;
    private final ChargeRepository charges;
    private final SubscriptionEngine engine;
    private final BillingProperties properties;
    private final TransactionTemplate tx;

    SubscriptionLifecycleJob(SubscriptionRepository subscriptions, ChargeRepository charges, SubscriptionEngine engine,
            BillingProperties properties, TransactionTemplate tx) {
        this.subscriptions = subscriptions;
        this.charges = charges;
        this.engine = engine;
        this.properties = properties;
        this.tx = tx;
    }

    @Scheduled(fixedDelayString = "${shopivo.billing.job-interval:PT15M}", initialDelayString = "PT1M")
    @SchedulerLock(name = "subscriptions.lifecycle", lockAtMostFor = "PT14M")
    public void run() {
        runAt(Instant.now());
    }

    /** Exposed for tests (deterministic clock). */
    public void runAt(Instant now) {
        each("trial-notice", () -> subscriptions.trialsEndingBetween(now, now.plus(properties.trialEndingNotice())),
                t -> engine.sendTrialEndingNotice());
        each("trial-end", () -> subscriptions.trialsEndedBy(now), t -> engine.processTrialEnd(now));
        each("renewal", () -> subscriptions.dueForRenewal(now.plus(properties.renewalLead())), t -> engine.issueRenewal(now));
        each("period-end", () -> subscriptions.periodEndedBy(now), t -> engine.processPeriodEnd(now));
        each("grace-end", () -> subscriptions.graceEndedBy(now), t -> engine.processGraceEnd(now));
        each("reminders", () -> charges.tenantsWithChargesToRemind(now.plus(java.time.Duration.ofDays(3)), properties.maxReminders()),
                t -> engine.remindUnpaid(now));
    }

    private void each(String step, Supplier<List<UUID>> candidates, Consumer<UUID> action) {
        List<UUID> tenants = TenantContext.callAsSystem(() -> tx.execute(s -> candidates.get().stream().distinct().toList()));
        for (UUID tenantId : tenants) {
            try {
                TenantContext.runInTenant(tenantId, () -> action.accept(tenantId));
            } catch (RuntimeException e) {
                log.error("Subscription lifecycle step {} failed for tenant {}", step, tenantId, e);
            }
        }
    }
}

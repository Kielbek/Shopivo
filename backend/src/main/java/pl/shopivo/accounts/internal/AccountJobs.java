package pl.shopivo.accounts.internal;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.shared.tenancy.TenantContext;

/** Removes expired customer sessions and used/expired account tokens. */
@Component
class AccountJobs {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    AccountJobs(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    @Scheduled(cron = "${shopivo.accounts.cleanup-cron:0 13 3 * * *}")
    @SchedulerLock(name = "accounts.cleanup", lockAtMostFor = "PT20M")
    public void cleanup() {
        TenantContext.callAsSystem(() -> tx.execute(s -> {
            jdbc.update("delete from customer_sessions where expires_at < now()");
            jdbc.update("delete from customer_account_tokens where expires_at < now() - interval '7 days' or used_at < now() - interval '7 days'");
            // Registrations nobody confirmed within 30 days (activation links last 48 h): personal data is not kept.
            jdbc.update("delete from customer_accounts where email_verified_at is null and created_at < now() - interval '30 days'");
            return null;
        }));
    }
}

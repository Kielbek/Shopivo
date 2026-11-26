package pl.shopivo.orders.internal;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.orders.Orders;
import pl.shopivo.shared.tenancy.TenantContext;

/** Cancels bank-transfer orders not paid within the store's deadline (releasing stock) and removes stale carts. */
@Component
public class OrderJobs {

    private static final Logger log = LoggerFactory.getLogger(OrderJobs.class);

    private final JdbcTemplate jdbc;
    private final Orders orders;
    private final TransactionTemplate tx;

    OrderJobs(JdbcTemplate jdbc, Orders orders, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.orders = orders;
        this.tx = tx;
    }

    record Due(UUID tenantId, UUID orderId) {
    }

    @Scheduled(cron = "${shopivo.orders.unpaid-cron:0 23 * * * *}")
    @SchedulerLock(name = "orders.unpaid", lockAtMostFor = "PT20M")
    public void cancelUnpaid() {
        cancelUnpaidAt(Instant.now());
    }

    public void cancelUnpaidAt(Instant now) {
        List<Due> due = TenantContext.callAsSystem(() -> tx.execute(s -> jdbc.query("""
                select o.tenant_id, o.id from orders o
                left join store_payment_settings p on p.tenant_id = o.tenant_id
                where o.status = 'NEW' and o.payment_status = 'UNPAID' and o.payment_method = 'BANK_TRANSFER'
                  and o.created_at < ?::timestamptz - make_interval(days => coalesce(p.unpaid_cancel_days, 7))
                limit 500
                """, (rs, i) -> new Due(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)), java.sql.Timestamp.from(now))));
        for (Due d : due) {
            try {
                TenantContext.runInTenant(d.tenantId(), () -> orders.cancelUnpaid(d.orderId(), "Brak płatności w wyznaczonym terminie"));
            } catch (RuntimeException e) {
                log.error("Auto-cancel of order {} failed", d.orderId(), e);
            }
        }
    }

    @Scheduled(cron = "${shopivo.orders.cart-cleanup-cron:0 47 * * * *}")
    @SchedulerLock(name = "orders.carts.cleanup", lockAtMostFor = "PT20M")
    public void deleteStaleCarts() {
        // Abandoned carts after 30 days; carts that never got an item after a day (cheap to create, so they could be
        // used to fill the table).
        TenantContext.runAsSystem(() -> tx.executeWithoutResult(s -> {
            jdbc.update("delete from carts where updated_at < now() - interval '30 days'");
            jdbc.update("delete from carts c where c.status = 'OPEN' and c.updated_at < now() - interval '1 day' "
                    + "and not exists (select 1 from cart_items i where i.cart_id = c.id)");
        }));
    }
}

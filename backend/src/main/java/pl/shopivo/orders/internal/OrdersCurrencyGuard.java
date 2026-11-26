package pl.shopivo.orders.internal;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.CurrencyChangeGuard;

@Component
class OrdersCurrencyGuard implements CurrencyChangeGuard {

    private final JdbcTemplate jdbc;

    OrdersCurrencyGuard(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String blockingReason() {
        Boolean any = jdbc.queryForObject("select exists(select 1 from orders where tenant_id = ?) or exists(select 1 from shipping_methods where tenant_id = ?)",
                Boolean.class, TenantContext.requireTenantId(), TenantContext.requireTenantId());
        return Boolean.TRUE.equals(any) ? "sklep ma już zamówienia lub cenniki dostaw" : null;
    }
}

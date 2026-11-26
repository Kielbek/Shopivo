package pl.shopivo.orders.internal;

import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import pl.shopivo.orders.PaymentSettings;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StorePublishCheck;

@Component
class OrdersPublishCheck implements StorePublishCheck {

    private final JdbcTemplate jdbc;
    private final PaymentSettings payments;

    OrdersPublishCheck(JdbcTemplate jdbc, PaymentSettings payments) {
        this.jdbc = jdbc;
        this.payments = payments;
    }

    @Override
    public List<String> missingForPublish() {
        List<String> missing = new ArrayList<>();
        Boolean shipping = jdbc.queryForObject("select exists(select 1 from shipping_methods where tenant_id = ? and active)", Boolean.class,
                TenantContext.requireTenantId());
        if (!Boolean.TRUE.equals(shipping)) missing.add("Dodaj co najmniej jeden sposób dostawy");
        var p = payments.current();
        if (!p.bankTransferEnabled() && !p.codEnabled()) missing.add("Włącz co najmniej jedną metodę płatności");
        return missing;
    }
}

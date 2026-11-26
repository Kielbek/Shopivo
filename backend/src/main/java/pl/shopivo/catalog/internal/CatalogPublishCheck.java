package pl.shopivo.catalog.internal;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StorePublishCheck;

@Component
class CatalogPublishCheck implements StorePublishCheck {

    private final JdbcTemplate jdbc;

    CatalogPublishCheck(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<String> missingForPublish() {
        Boolean any = jdbc.queryForObject("select exists(select 1 from products where tenant_id = ? and status = 'ACTIVE')", Boolean.class,
                TenantContext.requireTenantId());
        return Boolean.TRUE.equals(any) ? List.of() : List.of("Dodaj i aktywuj co najmniej jeden produkt");
    }
}

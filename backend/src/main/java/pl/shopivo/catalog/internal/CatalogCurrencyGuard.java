package pl.shopivo.catalog.internal;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.CurrencyChangeGuard;

@Component
class CatalogCurrencyGuard implements CurrencyChangeGuard {

    private final JdbcTemplate jdbc;

    CatalogCurrencyGuard(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String blockingReason() {
        Boolean any = jdbc.queryForObject("select exists(select 1 from product_variants where tenant_id = ?)", Boolean.class,
                TenantContext.requireTenantId());
        return Boolean.TRUE.equals(any) ? "sklep ma już produkty z cenami" : null;
    }
}

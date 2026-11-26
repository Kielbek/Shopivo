package pl.shopivo.accounts.internal;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import pl.shopivo.customers.CustomerAccountLookup;
import pl.shopivo.shared.tenancy.TenantContext;

@Component
class AccountLookup implements CustomerAccountLookup {

    private final JdbcTemplate jdbc;

    AccountLookup(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<String, Instant> verifiedAccountsCreatedAt(Collection<String> emails) {
        Map<String, Instant> result = new HashMap<>();
        if (emails.isEmpty()) return result;
        jdbc.query("select email, created_at from customer_accounts where tenant_id = ? and email = any(?) and email_verified_at is not null",
                rs -> {
                    result.put(rs.getString(1), rs.getTimestamp(2).toInstant());
                }, TenantContext.requireTenantId(), emails.toArray(String[]::new));
        return result;
    }
}

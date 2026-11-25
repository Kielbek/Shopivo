package pl.shopivo.shared.tenancy;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/**
 * Sets the PostgreSQL session variables used by Row Level Security policies on every
 * connection checkout. Values are always overwritten, so nothing leaks between pooled usages.
 */
public class TenantAwareDataSource extends DelegatingDataSource {

    private static final String SET_CONTEXT_SQL = "SELECT set_config('app.tenant_id', ?, false), "
            + "set_config('app.user_id', ?, false), set_config('app.bypass_rls', ?, false)";

    public TenantAwareDataSource(DataSource target) {
        super(target);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return applyContext(super.getConnection());
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return applyContext(super.getConnection(username, password));
    }

    private Connection applyContext(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(SET_CONTEXT_SQL)) {
            statement.setString(1, TenantContext.tenantId().map(UUID::toString).orElse(""));
            statement.setString(2, TenantContext.userId().map(UUID::toString).orElse(""));
            statement.setString(3, TenantContext.isSystem() ? "on" : "off");
            statement.execute();
            return connection;
        } catch (SQLException | RuntimeException e) {
            connection.close();
            throw e;
        }
    }
}

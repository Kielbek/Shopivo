package pl.shopivo.tenants;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/**
 * Database-level isolation: even raw SQL issued by the application role cannot see or write rows of another
 * tenant. This is the safety net behind the application-level checks.
 */
class RowLevelSecurityIT extends IntegrationTest {

    @Autowired
    DataSource dataSource;

    @Test
    void applicationRoleSeesOnlyCurrentTenantRows() throws SQLException {
        ApiClient alice = registeredUser(uniqueEmail("rls-a"));
        ApiClient bob = registeredUser(uniqueEmail("rls-b"));
        UUID a = UUID.fromString(createStore(alice, "RLS A", uniqueSlug("rlsa")));
        UUID b = UUID.fromString(createStore(bob, "RLS B", uniqueSlug("rlsb")));

        TenantContext.runInTenant(a, () -> {
            assertThat(count("select count(*) from stores where tenant_id in (?, ?)", a, b)).isEqualTo(1);
            assertThat(count("select count(*) from stores where tenant_id = ?", b)).isZero();
            assertThat(count("select count(*) from store_settings where tenant_id = ?", b)).isZero();
            assertThat(count("select count(*) from store_domains where tenant_id = ?", b)).isZero();
            assertThat(count("select count(*) from tenant_memberships where tenant_id = ?", b)).isZero();
            assertThat(count("select count(*) from audit_logs where tenant_id = ?", b)).isZero();
        });

        // No tenant bound: nothing visible
        assertThat(count("select count(*) from stores where tenant_id in (?, ?)", a, b)).isZero();

        // Explicit system context: everything visible
        TenantContext.runAsSystem(() ->
                assertThat(count("select count(*) from stores where tenant_id in (?, ?)", a, b)).isEqualTo(2));
    }

    @Test
    void writesIntoAnotherTenantAreRejected() {
        ApiClient alice = registeredUser(uniqueEmail("rls-w"));
        ApiClient bob = registeredUser(uniqueEmail("rls-w2"));
        UUID a = UUID.fromString(createStore(alice, "W A", uniqueSlug("wa")));
        UUID b = UUID.fromString(createStore(bob, "W B", uniqueSlug("wb")));

        TenantContext.runInTenant(a, () -> {
            assertThatThrownBy(() -> execute("insert into store_domains (id, tenant_id, hostname, type, status) "
                    + "values (?, ?, ?, 'CUSTOM', 'PENDING_VERIFICATION')", UUID.randomUUID(), b, "evil-" + UUID.randomUUID() + ".pl"))
                    .hasMessageContaining("row-level security");
            // UPDATE/DELETE silently affect zero rows of other tenants
            assertThat(update("update stores set name = 'hacked' where tenant_id = ?", b)).isZero();
            assertThat(update("delete from store_settings where tenant_id = ?", b)).isZero();
        });
        TenantContext.runAsSystem(() ->
                assertThat(count("select count(*) from stores where tenant_id = ? and name = 'W B'", b)).isEqualTo(1));
    }

    @Test
    void auditLogIsAppendOnlyForApplicationRole() {
        assertThatThrownBy(() -> TenantContext.runAsSystem(() -> update("delete from audit_logs")))
                .hasMessageContaining("permission denied");
    }

    @Test
    void contextCannotBeSwitchedInsideTransaction() {
        assertThatThrownBy(() -> new org.springframework.transaction.support.TransactionTemplate(
                new org.springframework.jdbc.datasource.DataSourceTransactionManager(dataSource))
                .executeWithoutResult(s -> TenantContext.runAsSystem(() -> { })))
                .isInstanceOf(IllegalStateException.class);
    }

    private long count(String sql, Object... params) {
        try (Connection c = dataSource.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        } catch (SQLException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    private int update(String sql, Object... params) {
        try (Connection c = dataSource.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            return ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    private void execute(String sql, Object... params) {
        update(sql, params);
    }

    private static void bind(PreparedStatement ps, Object... params) throws SQLException {
        for (int i = 0; i < params.length; i++) {
            ps.setObject(i + 1, params[i]);
        }
    }
}

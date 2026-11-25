package pl.shopivo.shared.tenancy;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.function.Supplier;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Holds the tenant and user the current thread is working for.
 *
 * <p>The tenant is never taken from client input: it is set by the server after verifying
 * a membership (merchant API) or a domain mapping (storefront). The values drive both
 * Hibernate's {@code @TenantId} filtering and PostgreSQL Row Level Security
 * (see {@link TenantAwareDataSource}).
 *
 * <p>Context changes take effect for database connections acquired afterwards, so they must
 * happen <em>outside</em> of a running transaction.
 */
public final class TenantContext {

    private static final ThreadLocal<State> STATE = ThreadLocal.withInitial(() -> State.EMPTY);

    private TenantContext() {
    }

    record State(UUID tenantId, UUID userId, boolean system) {
        static final State EMPTY = new State(null, null, false);
    }

    public static Optional<UUID> tenantId() {
        return Optional.ofNullable(STATE.get().tenantId());
    }

    public static UUID requireTenantId() {
        UUID id = STATE.get().tenantId();
        if (id == null) {
            throw new IllegalStateException("No tenant bound to the current thread");
        }
        return id;
    }

    public static Optional<UUID> userId() {
        return Optional.ofNullable(STATE.get().userId());
    }

    public static boolean isSystem() {
        return STATE.get().system();
    }

    /** Binds the authenticated user for the remainder of the request. Cleared by {@link #clear()}. */
    public static void bindUser(UUID userId) {
        State s = STATE.get();
        STATE.set(new State(s.tenantId(), userId, s.system()));
    }

    /** Binds a verified tenant for the remainder of the request. Cleared by {@link #clear()}. */
    public static void bindTenant(UUID tenantId) {
        State s = STATE.get();
        STATE.set(new State(tenantId, s.userId(), false));
    }

    public static void clear() {
        STATE.remove();
    }

    /** Runs code for a specific, already verified tenant. Restores the previous context afterwards. */
    public static <T> T callInTenant(UUID tenantId, Supplier<T> action) {
        assertNoTransaction();
        State previous = STATE.get();
        STATE.set(new State(tenantId, previous.userId(), false));
        try {
            return action.get();
        } finally {
            STATE.set(previous);
        }
    }

    public static void runInTenant(UUID tenantId, Runnable action) {
        callInTenant(tenantId, () -> {
            action.run();
            return null;
        });
    }

    /**
     * Runs code with tenant isolation lifted (RLS bypass + Hibernate root tenant). Reserved for
     * platform administration, cross-tenant jobs and domain routing. Every usage must be reviewed.
     */
    public static <T> T callAsSystem(Supplier<T> action) {
        assertNoTransaction();
        State previous = STATE.get();
        STATE.set(new State(null, previous.userId(), true));
        try {
            return action.get();
        } finally {
            STATE.set(previous);
        }
    }

    public static void runAsSystem(Runnable action) {
        callAsSystem(() -> {
            action.run();
            return null;
        });
    }

    /**
     * A context switch inside a running transaction would be silently ignored (the connection and the Hibernate
     * session are already bound to the previous context), so it is rejected outright.
     */
    private static void assertNoTransaction() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Tenant context must not be switched inside an active transaction");
        }
    }

    /** Captures the current context so it can be re-applied on another thread. */
    public static <T> Callable<T> wrap(Callable<T> task) {
        State captured = STATE.get();
        return () -> {
            State previous = STATE.get();
            STATE.set(captured);
            try {
                return task.call();
            } finally {
                STATE.set(previous);
            }
        };
    }
}

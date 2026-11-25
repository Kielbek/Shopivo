package pl.shopivo.authentication.internal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.users.PlatformRole;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserStatus;
import pl.shopivo.users.UserView;

class PlatformAdminBootstrapTest {

    private final UserAccounts users = mock(UserAccounts.class);
    private final TransactionTemplate tx = new TransactionTemplate() {
        @Override
        public <T> T execute(TransactionCallback<T> action) {
            return action.doInTransaction(null);
        }
    };

    private PlatformAdminBootstrap bootstrap() {
        var props = new ShopivoProperties(null, null, null, null, null, null,
                new ShopivoProperties.Bootstrap("admin@firma.pl", "Platforma!Startowa-2026"));
        return new PlatformAdminBootstrap(users, mock(PasswordEncoder.class), new PasswordPolicy(), tx, props);
    }

    private static UserView user(boolean verified) {
        return new UserView(UUID.randomUUID(), "admin@firma.pl", "A", "B",
                verified ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION, null, verified, "pl-PL", false, null,
                Instant.now());
    }

    @Test
    void doesNotElevatePreRegisteredUnverifiedAccount() {
        UserView squatter = user(false);
        when(users.findByEmail("admin@firma.pl")).thenReturn(Optional.of(squatter));
        bootstrap().run(new DefaultApplicationArguments());
        verify(users, never()).grantPlatformRole(any(), any());
    }

    @Test
    void elevatesExistingVerifiedAccount() {
        UserView owner = user(true);
        when(users.findByEmail("admin@firma.pl")).thenReturn(Optional.of(owner));
        bootstrap().run(new DefaultApplicationArguments());
        verify(users).grantPlatformRole(owner.id(), PlatformRole.PLATFORM_ADMIN);
    }

    @Test
    void doesNothingWhenAnAdministratorExists() {
        when(users.anyPlatformAdminExists()).thenReturn(true);
        bootstrap().run(new DefaultApplicationArguments());
        verify(users, never()).findByEmail(any());
    }
}

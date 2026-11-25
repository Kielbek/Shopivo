package pl.shopivo.authentication.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.users.PlatformRole;
import pl.shopivo.users.UserAccounts;

/**
 * Creates the first platform administrator from SHOPIVO_BOOTSTRAP_ADMIN_EMAIL / _PASSWORD when no administrator
 * exists yet. Does nothing once an administrator exists, so the variables can be removed after the first deploy.
 */
@Component
class PlatformAdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PlatformAdminBootstrap.class);

    private final UserAccounts users;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final TransactionTemplate tx;
    private final ShopivoProperties properties;

    PlatformAdminBootstrap(UserAccounts users, PasswordEncoder passwordEncoder, PasswordPolicy passwordPolicy,
            TransactionTemplate tx, ShopivoProperties properties) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.tx = tx;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        ShopivoProperties.Bootstrap config = properties.bootstrap();
        if (config == null || config.adminEmail() == null || config.adminEmail().isBlank()
                || config.adminPassword() == null || config.adminPassword().isBlank()) {
            return;
        }
        tx.executeWithoutResult(s -> {
            if (users.anyPlatformAdminExists()) {
                return;
            }
            passwordPolicy.validate(config.adminPassword(), config.adminEmail());
            var user = users.findByEmail(config.adminEmail()).orElseGet(() -> users.register(config.adminEmail(),
                    "Administrator", "Platformy", passwordEncoder.encode(config.adminPassword()), true, null));
            users.grantPlatformRole(user.id(), PlatformRole.PLATFORM_ADMIN);
            log.info("Bootstrapped platform administrator account {}", user.id());
        });
    }
}

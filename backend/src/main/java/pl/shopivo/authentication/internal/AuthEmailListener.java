package pl.shopivo.authentication.internal;

import java.time.Duration;
import java.util.Map;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;
import pl.shopivo.email.EmailSender;
import pl.shopivo.email.EmailTemplates;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserStatus;
import pl.shopivo.users.UserView;

/**
 * Sends authentication e-mails asynchronously after commit. Publications are persisted by Spring Modulith and
 * retried if delivery fails; tokens are generated here, so no secret is ever stored in the event log.
 */
@Component
class AuthEmailListener {

    static final Duration VERIFICATION_TTL = Duration.ofHours(24);
    static final Duration RESET_TTL = Duration.ofHours(1);

    private final UserAccounts users;
    private final OneTimeTokens tokens;
    private final EmailTemplates templates;
    private final EmailSender sender;
    private final ShopivoProperties properties;

    AuthEmailListener(UserAccounts users, OneTimeTokens tokens, EmailTemplates templates, EmailSender sender,
            ShopivoProperties properties) {
        this.users = users;
        this.tokens = tokens;
        this.templates = templates;
        this.sender = sender;
        this.properties = properties;
    }

    @ApplicationModuleListener
    void on(AuthEvents.VerificationEmailRequested event) {
        users.findById(event.userId()).filter(u -> !u.emailVerified()).ifPresent(user -> {
            String token = tokens.issue(user.id(), UserTokenEntity.Purpose.EMAIL_VERIFICATION, VERIFICATION_TTL);
            sender.send(templates.render("verify-email", user.email(),
                    Map.of("firstName", user.firstName(), "link", link("/weryfikacja-email", token))));
        });
    }

    @ApplicationModuleListener
    void on(AuthEvents.PasswordResetRequested event) {
        users.findById(event.userId())
                .filter(u -> u.status() == UserStatus.ACTIVE || u.status() == UserStatus.PENDING_VERIFICATION)
                .ifPresent(user -> {
                    String token = tokens.issue(user.id(), UserTokenEntity.Purpose.PASSWORD_RESET, RESET_TTL);
                    sender.send(templates.render("password-reset", user.email(),
                            Map.of("firstName", user.firstName(), "link", link("/nowe-haslo", token))));
                });
    }

    @ApplicationModuleListener
    void on(AuthEvents.RegistrationAttemptOnExistingAccount event) {
        users.findById(event.userId()).ifPresent(user -> sender.send(
                templates.render("account-exists", user.email(), Map.of("firstName", user.firstName()))));
    }

    @ApplicationModuleListener
    void on(AuthEvents.PasswordChanged event) {
        users.findById(event.userId()).ifPresent(user -> sender.send(
                templates.render("password-changed", user.email(), Map.of("firstName", user.firstName()))));
    }

    @ApplicationModuleListener
    void on(AuthEvents.MfaEnabled event) {
        users.findById(event.userId()).map(UserView.class::cast).ifPresent(user -> sender.send(
                templates.render("mfa-enabled", user.email(), Map.of("firstName", user.firstName()))));
    }

    private String link(String path, String token) {
        return UriComponentsBuilder.fromUriString(properties.appUrl()).path(path).queryParam("token", token)
                .build().toUriString();
    }
}

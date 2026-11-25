package pl.shopivo.authentication.internal;

import java.util.UUID;

/** Internal events of the authentication module. They never carry secrets: tokens are issued by the listener. */
final class AuthEvents {

    private AuthEvents() {
    }

    record VerificationEmailRequested(UUID userId) {
    }

    record PasswordResetRequested(UUID userId) {
    }

    record RegistrationAttemptOnExistingAccount(UUID userId) {
    }

    record PasswordChanged(UUID userId) {
    }

    record MfaEnabled(UUID userId) {
    }
}

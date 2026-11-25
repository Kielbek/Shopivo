package pl.shopivo.users;

import java.time.Instant;
import java.util.UUID;

/** Data needed by the authentication module only. Never exposed through the API. */
public record UserCredentials(
        UUID id,
        String email,
        String passwordHash,
        UserStatus status,
        PlatformRole platformRole,
        boolean emailVerified,
        int failedLoginCount,
        Instant lockedUntil,
        boolean mfaEnabled) {

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }
}

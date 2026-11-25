package pl.shopivo.users;

import java.time.Instant;
import java.util.UUID;

public record UserView(
        UUID id,
        String email,
        String firstName,
        String lastName,
        UserStatus status,
        PlatformRole platformRole,
        boolean emailVerified,
        String locale,
        boolean mfaEnabled,
        Instant lastLoginAt,
        Instant createdAt) {

    public String fullName() {
        return (firstName + " " + lastName).trim();
    }
}

package pl.shopivo.users;

import java.util.UUID;

/** Published synchronously when an account is suspended/reactivated, so sessions can be revoked. */
public record UserStatusChangedEvent(UUID userId, UserStatus newStatus) {
}

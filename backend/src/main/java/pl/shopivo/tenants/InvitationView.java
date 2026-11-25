package pl.shopivo.tenants;

import java.time.Instant;
import java.util.UUID;

public record InvitationView(UUID id, String email, StoreRole role, Instant expiresAt, Instant createdAt) {
}

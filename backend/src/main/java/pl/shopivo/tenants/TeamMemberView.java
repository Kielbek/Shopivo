package pl.shopivo.tenants;

import java.time.Instant;
import java.util.UUID;

public record TeamMemberView(
        UUID membershipId,
        UUID userId,
        String email,
        String fullName,
        StoreRole role,
        MembershipStatus status,
        Instant joinedAt) {
}

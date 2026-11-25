package pl.shopivo.shared.security;

import java.util.UUID;

/**
 * Authenticated platform user (merchant or platform staff) — the Spring Security principal.
 *
 * @param platformRole {@code null} for merchants, otherwise {@code PLATFORM_ADMIN} / {@code PLATFORM_SUPPORT}
 * @param mfaPending   {@code true} when the password step succeeded but the second factor is still required
 */
public record CurrentUser(
        UUID id,
        String email,
        String platformRole,
        UUID sessionId,
        boolean mfaPending) {

    public boolean isPlatformAdmin() {
        return "PLATFORM_ADMIN".equals(platformRole);
    }

    public boolean isPlatformStaff() {
        return platformRole != null;
    }
}

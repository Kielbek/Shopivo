package pl.shopivo.tenants;

import java.util.UUID;

/** Carries no token — the delivery listener issues a fresh token, so no secret is persisted in the outbox. */
public record InvitationCreatedEvent(UUID tenantId, UUID invitationId, UUID invitedBy) {
}

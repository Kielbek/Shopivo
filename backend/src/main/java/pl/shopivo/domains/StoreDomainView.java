package pl.shopivo.domains;

import java.time.Instant;
import java.util.UUID;

public record StoreDomainView(UUID id, String hostname, DomainType type, DomainStatus status, boolean primary, Instant createdAt) {
}

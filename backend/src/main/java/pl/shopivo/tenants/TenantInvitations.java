package pl.shopivo.tenants;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.security.CurrentUser;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.tenants.internal.InvitationEntity;
import pl.shopivo.tenants.internal.InvitationRepository;
import pl.shopivo.users.UserAccounts;

/** Team invitations. Tokens are delivered by e-mail only; the database stores their SHA-256 hashes. */
@Service
public class TenantInvitations {

    public static final Duration VALIDITY = Duration.ofDays(7);

    private final InvitationRepository invitations;
    private final TenantMemberships memberships;
    private final UserAccounts users;
    private final AuditLog auditLog;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate tx;
    private final java.util.List<TeamSizePolicy> teamSizePolicies;

    TenantInvitations(InvitationRepository invitations, TenantMemberships memberships, UserAccounts users,
            AuditLog auditLog, ApplicationEventPublisher events, TransactionTemplate tx,
            java.util.List<TeamSizePolicy> teamSizePolicies) {
        this.teamSizePolicies = teamSizePolicies;
        this.invitations = invitations;
        this.memberships = memberships;
        this.users = users;
        this.auditLog = auditLog;
        this.events = events;
        this.tx = tx;
    }

    public InvitationView invite(String email, StoreRole role, UUID invitedBy) {
        if (role == StoreRole.OWNER) {
            throw new BusinessRuleException("OWNER_ROLE_RESTRICTED", "Nie można zaprosić użytkownika z rolą właściciela.");
        }
        String normalized = UserAccounts.normalizeEmail(email);
        UUID tenantId = TenantContext.requireTenantId();
        return tx.execute(status -> {
            users.findByEmail(normalized).ifPresent(u -> {
                if (memberships.isMember(u.id())) {
                    throw new ConflictException("ALREADY_MEMBER", "Ten użytkownik już należy do zespołu sklepu.");
                }
            });
            Instant now = Instant.now();
            long teamSize = memberships.team().size() + invitations.findPending(now).size();
            teamSizePolicies.forEach(p -> p.checkCanAddMember(tenantId, teamSize));
            invitations.findOpenForEmail(normalized).ifPresent(existing -> {
                if (existing.isPending(now)) {
                    throw new ConflictException("INVITATION_PENDING", "Zaproszenie dla tego adresu już oczekuje na akceptację.");
                }
                existing.revoke(now);
                invitations.flush();
            });
            // The real token is issued by the delivery listener; this placeholder hash is never sent anywhere.
            InvitationEntity invitation = invitations.save(new InvitationEntity(normalized, role,
                    Tokens.sha256(Tokens.newToken()), invitedBy, now.plus(VALIDITY)));
            auditLog.record(AuditEntry.tenant("team.invitation.created", tenantId, "invitation", invitation.getId())
                    .with(Map.of("role", role.name())));
            events.publishEvent(new InvitationCreatedEvent(tenantId, invitation.getId(), invitedBy));
            return invitation.toView();
        });
    }

    public List<InvitationView> pending() {
        return tx.execute(s -> invitations.findPending(Instant.now()).stream().map(InvitationEntity::toView).toList());
    }

    public void revoke(UUID invitationId) {
        UUID tenantId = TenantContext.requireTenantId();
        tx.executeWithoutResult(s -> {
            InvitationEntity inv = invitations.findById(invitationId).orElseThrow(NotFoundException::new);
            inv.revoke(Instant.now());
            auditLog.record(AuditEntry.tenant("team.invitation.revoked", tenantId, "invitation", invitationId));
        });
    }

    public void resend(UUID invitationId, UUID actorId) {
        UUID tenantId = TenantContext.requireTenantId();
        tx.executeWithoutResult(s -> {
            InvitationEntity inv = invitations.findById(invitationId).orElseThrow(NotFoundException::new);
            if (!inv.isPending(Instant.now())) {
                throw new BusinessRuleException("INVITATION_NOT_PENDING", "To zaproszenie nie jest już aktywne.");
            }
            events.publishEvent(new InvitationCreatedEvent(tenantId, invitationId, actorId));
        });
    }

    /**
     * Accepts an invitation for the logged-in user. The invitation is bound to an e-mail address: it can only be
     * accepted by the account with that (verified) address.
     */
    public UUID accept(String token, CurrentUser user) {
        String hash = Tokens.sha256(token);
        // Token lookup is cross-tenant by nature (the token is the only input) — system context is justified here.
        InvitationEntity found = TenantContext.callAsSystem(() -> tx.execute(s -> invitations.findByTokenHash(hash).orElse(null)));
        if (found == null || !found.isPending(Instant.now())) {
            throw new BusinessRuleException("INVITATION_INVALID", "Zaproszenie jest nieprawidłowe lub wygasło.");
        }
        if (!found.getEmail().equalsIgnoreCase(user.email())) {
            throw new BusinessRuleException("INVITATION_EMAIL_MISMATCH",
                    "Zaproszenie zostało wysłane na inny adres e-mail. Zaloguj się na właściwe konto.");
        }
        UUID tenantId = found.getTenantId();
        TenantContext.runInTenant(tenantId, () -> tx.executeWithoutResult(s -> {
            InvitationEntity inv = invitations.findById(found.getId()).orElseThrow(NotFoundException::new);
            if (!inv.isPending(Instant.now())) {
                throw new BusinessRuleException("INVITATION_INVALID", "Zaproszenie jest nieprawidłowe lub wygasło.");
            }
            MembershipView membership = memberships.addMember(user.id(), inv.getRole());
            inv.accept(Instant.now());
            auditLog.record(AuditEntry.tenant("team.invitation.accepted", tenantId, "membership", membership.id())
                    .with(Map.of("role", inv.getRole().name())));
        }));
        return tenantId;
    }
}

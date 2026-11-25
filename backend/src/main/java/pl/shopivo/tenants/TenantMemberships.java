package pl.shopivo.tenants;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.tenants.internal.MembershipEntity;
import pl.shopivo.tenants.internal.MembershipRepository;
import pl.shopivo.tenants.internal.TenantEntity;
import pl.shopivo.tenants.internal.TenantRepository;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserView;

/** Public API: tenants, memberships and team management inside the current tenant. */
@Service
@Transactional
public class TenantMemberships {

    private final TenantRepository tenants;
    private final MembershipRepository memberships;
    private final UserAccounts users;
    private final AuditLog auditLog;

    TenantMemberships(TenantRepository tenants, MembershipRepository memberships, UserAccounts users, AuditLog auditLog) {
        this.tenants = tenants;
        this.memberships = memberships;
        this.users = users;
        this.auditLog = auditLog;
    }

    @Transactional(readOnly = true)
    public Optional<MembershipView> findActiveMembership(UUID userId, UUID tenantId) {
        return memberships.findActive(userId, tenantId).map(MembershipEntity::toView);
    }

    @Transactional(readOnly = true)
    public List<UserTenantView> tenantsOfUser(UUID userId) {
        List<MembershipEntity> own = memberships.findByUserIdOrderByCreatedAtAsc(userId).stream()
                .filter(m -> m.getStatus() == MembershipStatus.ACTIVE)
                .toList();
        Map<UUID, TenantEntity> byId = tenants.findAllById(own.stream().map(MembershipEntity::getTenantId).toList())
                .stream().collect(Collectors.toMap(TenantEntity::getId, Function.identity()));
        return own.stream()
                .filter(m -> byId.containsKey(m.getTenantId()))
                .filter(m -> byId.get(m.getTenantId()).getStatus() != TenantStatus.CLOSED)
                .map(m -> {
                    TenantEntity t = byId.get(m.getTenantId());
                    return new UserTenantView(t.getId(), t.getName(), t.getStatus(), m.getRole());
                })
                .toList();
    }

    /** Tenants table has no RLS: safe to query for routing decisions (storefront). */
    @Transactional(readOnly = true)
    public boolean isTenantActive(UUID tenantId) {
        return tenants.findById(tenantId).map(t -> t.getStatus() == TenantStatus.ACTIVE).orElse(false);
    }

    @Transactional(readOnly = true)
    public long countOwnedTenants(UUID userId) {
        return memberships.countByUserIdAndRole(userId, StoreRole.OWNER);
    }

    /**
     * Creates a tenant and its owner membership. Must run inside {@code TenantContext.callInTenant(tenantId, …)}
     * so RLS allows writing rows of the new tenant.
     */
    public TenantView createTenantWithOwner(UUID tenantId, String name, UUID ownerUserId) {
        if (!tenantId.equals(TenantContext.tenantId().orElse(null))) {
            throw new IllegalStateException("Tenant creation must run in the context of the new tenant");
        }
        TenantEntity tenant = tenants.save(new TenantEntity(tenantId, name, ownerUserId));
        memberships.save(new MembershipEntity(tenantId, ownerUserId, StoreRole.OWNER));
        return tenant.toView();
    }

    @Transactional(readOnly = true)
    public TenantView currentTenant() {
        return tenants.findById(TenantContext.requireTenantId()).map(TenantEntity::toView)
                .orElseThrow(NotFoundException::new);
    }

    public void renameCurrentTenant(String name) {
        tenants.findById(TenantContext.requireTenantId()).orElseThrow(NotFoundException::new).rename(name);
    }

    // ---------------------------------------------------------------- team (current tenant)

    @Transactional(readOnly = true)
    public List<TeamMemberView> team() {
        UUID tenantId = TenantContext.requireTenantId();
        return memberships.findByTenantIdOrderByCreatedAtAsc(tenantId).stream()
                .map(m -> {
                    UserView u = users.getById(m.getUserId());
                    return new TeamMemberView(m.getId(), u.id(), u.email(), u.fullName(), m.getRole(), m.getStatus(),
                            m.toView().createdAt());
                })
                .toList();
    }

    /** User ids of active owners of the current tenant (billing notifications). */
    @Transactional(readOnly = true)
    public List<UUID> activeOwnerIds() {
        return memberships.findByTenantIdOrderByCreatedAtAsc(TenantContext.requireTenantId()).stream()
                .filter(m -> m.getRole() == StoreRole.OWNER && m.getStatus() == MembershipStatus.ACTIVE)
                .map(MembershipEntity::getUserId).toList();
    }

    @Transactional(readOnly = true)
    public long activeMemberCount() {
        return memberships.findByTenantIdOrderByCreatedAtAsc(TenantContext.requireTenantId()).stream()
                .filter(m -> m.getStatus() == MembershipStatus.ACTIVE).count();
    }

    /** Adds a user to the current tenant (invitation acceptance). */
    public MembershipView addMember(UUID userId, StoreRole role) {
        UUID tenantId = TenantContext.requireTenantId();
        if (memberships.findByTenantIdAndUserId(tenantId, userId).isPresent()) {
            throw new ConflictException("ALREADY_MEMBER", "Ten użytkownik już należy do zespołu sklepu.");
        }
        return memberships.save(new MembershipEntity(tenantId, userId, role)).toView();
    }

    @Transactional(readOnly = true)
    public boolean isMember(UUID userId) {
        return memberships.findByTenantIdAndUserId(TenantContext.requireTenantId(), userId).isPresent();
    }

    public MembershipView updateMember(UUID membershipId, StoreRole newRole, MembershipStatus newStatus, MembershipView actor) {
        UUID tenantId = TenantContext.requireTenantId();
        tenants.lockById(tenantId).orElseThrow(NotFoundException::new);
        MembershipEntity target = memberships.findByIdAndTenantId(membershipId, tenantId).orElseThrow(NotFoundException::new);
        guardChange(target, actor);
        if (newRole == StoreRole.OWNER && !isOwner(actor)) {
            throw new BusinessRuleException("OWNER_ROLE_RESTRICTED", "Tylko właściciel może nadać rolę właściciela.");
        }
        StoreRole previousRole = target.getRole();
        if (newRole != null) {
            target.changeRole(newRole);
        }
        if (newStatus != null) {
            target.changeStatus(newStatus);
        }
        ensureActiveOwnerRemains(tenantId);
        auditLog.record(AuditEntry.tenant("team.member.updated", tenantId, "membership", membershipId)
                .with(Map.of("previousRole", previousRole.name(), "role", target.getRole().name(),
                        "status", target.getStatus().name())));
        return target.toView();
    }

    public void removeMember(UUID membershipId, MembershipView actor) {
        UUID tenantId = TenantContext.requireTenantId();
        tenants.lockById(tenantId).orElseThrow(NotFoundException::new);
        MembershipEntity target = memberships.findByIdAndTenantId(membershipId, tenantId).orElseThrow(NotFoundException::new);
        guardChange(target, actor);
        memberships.delete(target);
        memberships.flush();
        ensureActiveOwnerRemains(tenantId);
        auditLog.record(AuditEntry.tenant("team.member.removed", tenantId, "membership", membershipId)
                .with(Map.of("userId", target.getUserId().toString(), "role", target.getRole().name())));
    }

    private void guardChange(MembershipEntity target, MembershipView staleActor) {
        MembershipView actor = memberships.findByIdAndTenantId(staleActor.id(), target.getTenantId())
                .filter(m -> m.getStatus() == MembershipStatus.ACTIVE)
                .map(MembershipEntity::toView)
                .orElseThrow(pl.shopivo.shared.error.AccessDeniedApiException::new);
        if (!actor.role().has(StorePermission.TEAM_MANAGE)) {
            throw new pl.shopivo.shared.error.AccessDeniedApiException();
        }
        if (target.getId().equals(actor.id())) {
            throw new BusinessRuleException("CANNOT_MODIFY_SELF", "Nie możesz zmienić własnej roli ani usunąć siebie z zespołu.");
        }
        if (target.getRole() == StoreRole.OWNER && actor.role() != StoreRole.OWNER) {
            throw new BusinessRuleException("OWNER_ROLE_RESTRICTED", "Tylko właściciel może zmieniać konto innego właściciela.");
        }
    }

    private boolean isOwner(MembershipView actor) {
        return memberships.findById(actor.id()).map(m -> m.getRole() == StoreRole.OWNER).orElse(false);
    }

    private void ensureActiveOwnerRemains(UUID tenantId) {
        if (memberships.countByTenantIdAndRoleAndStatus(tenantId, StoreRole.OWNER, MembershipStatus.ACTIVE) < 1) {
            throw new BusinessRuleException("LAST_OWNER", "Sklep musi mieć co najmniej jednego aktywnego właściciela.");
        }
    }
}

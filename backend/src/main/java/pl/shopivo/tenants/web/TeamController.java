package pl.shopivo.tenants.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.tenants.InvitationView;
import pl.shopivo.tenants.MembershipStatus;
import pl.shopivo.tenants.MembershipView;
import pl.shopivo.tenants.StoreRole;
import pl.shopivo.tenants.TeamMemberView;
import pl.shopivo.tenants.TenantAccess;
import pl.shopivo.tenants.TenantInvitations;
import pl.shopivo.tenants.TenantMemberships;

@RestController
@RequestMapping("/api/v1/tenants/{tenantId}")
@Tag(name = "Team")
class TeamController {

    private final TenantMemberships memberships;
    private final TenantInvitations invitations;

    TeamController(TenantMemberships memberships, TenantInvitations invitations) {
        this.memberships = memberships;
        this.invitations = invitations;
    }

    record UpdateMemberRequest(StoreRole role, MembershipStatus status) {
    }

    record InviteRequest(@NotBlank @Email @Size(max = 320) String email, @NotNull StoreRole role) {
    }

    @GetMapping("/members")
    @PreAuthorize("@tenantAccess.can('TEAM_READ')")
    List<TeamMemberView> members(@PathVariable UUID tenantId) {
        return memberships.team();
    }

    @PatchMapping("/members/{membershipId}")
    @PreAuthorize("@tenantAccess.can('TEAM_MANAGE')")
    MembershipView update(@PathVariable UUID tenantId, @PathVariable UUID membershipId,
            @RequestBody UpdateMemberRequest request) {
        return memberships.updateMember(membershipId, request.role(), request.status(), TenantAccess.requireMembership());
    }

    @DeleteMapping("/members/{membershipId}")
    @PreAuthorize("@tenantAccess.can('TEAM_MANAGE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@PathVariable UUID tenantId, @PathVariable UUID membershipId) {
        memberships.removeMember(membershipId, TenantAccess.requireMembership());
    }

    @GetMapping("/invitations")
    @PreAuthorize("@tenantAccess.can('TEAM_MANAGE')")
    List<InvitationView> invitations(@PathVariable UUID tenantId) {
        return invitations.pending();
    }

    @PostMapping("/invitations")
    @PreAuthorize("@tenantAccess.can('TEAM_MANAGE')")
    @ResponseStatus(HttpStatus.CREATED)
    InvitationView invite(@PathVariable UUID tenantId, @Valid @RequestBody InviteRequest request) {
        return invitations.invite(request.email(), request.role(), SecurityUtils.requireUser().id());
    }

    @PostMapping("/invitations/{invitationId}/resend")
    @PreAuthorize("@tenantAccess.can('TEAM_MANAGE')")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void resend(@PathVariable UUID tenantId, @PathVariable UUID invitationId) {
        invitations.resend(invitationId, SecurityUtils.requireUser().id());
    }

    @DeleteMapping("/invitations/{invitationId}")
    @PreAuthorize("@tenantAccess.can('TEAM_MANAGE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@PathVariable UUID tenantId, @PathVariable UUID invitationId) {
        invitations.revoke(invitationId);
    }
}

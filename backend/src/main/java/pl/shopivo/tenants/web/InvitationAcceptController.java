package pl.shopivo.tenants.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.tenants.TenantInvitations;

@RestController
@Tag(name = "Team")
class InvitationAcceptController {

    private final TenantInvitations invitations;

    InvitationAcceptController(TenantInvitations invitations) {
        this.invitations = invitations;
    }

    record AcceptRequest(@NotBlank @Size(max = 100) String token) {
    }

    record AcceptResponse(UUID tenantId) {
    }

    @PostMapping("/api/v1/invitations/accept")
    AcceptResponse accept(@Valid @RequestBody AcceptRequest request) {
        return new AcceptResponse(invitations.accept(request.token(), SecurityUtils.requireUser()));
    }
}

package pl.shopivo.authentication.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.authentication.internal.AuthenticationService;
import pl.shopivo.authentication.internal.MfaService;
import pl.shopivo.authentication.internal.SessionService;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.security.CurrentUser;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserView;

@RestController
@RequestMapping("/api/v1/account")
@Tag(name = "Account")
class AccountController {

    private final UserAccounts users;
    private final AuthenticationService auth;
    private final SessionService sessions;
    private final MfaService mfa;

    AccountController(UserAccounts users, AuthenticationService auth, SessionService sessions, MfaService mfa) {
        this.users = users;
        this.auth = auth;
        this.sessions = sessions;
        this.mfa = mfa;
    }

    record ProfileRequest(@NotBlank @Size(max = 100) String firstName, @NotBlank @Size(max = 100) String lastName,
            @Pattern(regexp = "pl-PL|en-US") String locale) {
    }

    record ChangePasswordRequest(@NotBlank @Size(max = 128) String currentPassword,
            @NotBlank @Size(max = 128) String newPassword) {
    }

    record CodeRequest(@NotBlank @Size(max = 20) String code) {
    }

    record DisableMfaRequest(@NotBlank @Size(max = 128) String password, @NotBlank @Size(max = 20) String code) {
    }

    record RecoveryCodesResponse(List<String> recoveryCodes) {
    }

    record MfaStatusResponse(boolean enabled, long remainingRecoveryCodes) {
    }

    @PatchMapping("/profile")
    UserView updateProfile(@Valid @RequestBody ProfileRequest request) {
        return users.updateProfile(SecurityUtils.requireUser().id(), request.firstName(), request.lastName(), request.locale());
    }

    @PostMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        CurrentUser user = SecurityUtils.requireUser();
        if (request.currentPassword().equals(request.newPassword())) {
            throw new BusinessRuleException("PASSWORD_UNCHANGED", "Nowe hasło musi różnić się od obecnego.");
        }
        auth.changePassword(user.id(), user.sessionId(), request.currentPassword(), request.newPassword());
    }

    @GetMapping("/sessions")
    List<SessionService.SessionInfo> sessions() {
        CurrentUser user = SecurityUtils.requireUser();
        return sessions.active(user.id(), user.sessionId());
    }

    @DeleteMapping("/sessions/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revokeSession(@PathVariable UUID sessionId) {
        sessions.revokeOwnSession(SecurityUtils.requireUser().id(), sessionId);
    }

    @DeleteMapping("/sessions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revokeOtherSessions() {
        CurrentUser user = SecurityUtils.requireUser();
        sessions.revokeAll(user.id(), user.sessionId(), "USER_REVOKED_OTHERS");
    }

    @GetMapping("/mfa")
    MfaStatusResponse mfaStatus() {
        UUID userId = SecurityUtils.requireUser().id();
        UserView user = users.getById(userId);
        return new MfaStatusResponse(user.mfaEnabled(), user.mfaEnabled() ? mfa.remainingRecoveryCodes(userId) : 0);
    }

    @PostMapping("/mfa/totp/setup")
    MfaService.TotpSetup startTotpSetup() {
        return mfa.startSetup(SecurityUtils.requireUser().id());
    }

    @PostMapping("/mfa/totp/confirm")
    RecoveryCodesResponse confirmTotp(@Valid @RequestBody CodeRequest request) {
        CurrentUser user = SecurityUtils.requireUser();
        return new RecoveryCodesResponse(mfa.confirmSetup(user.id(), user.sessionId(), request.code()));
    }

    @PostMapping("/mfa/disable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disableMfa(@Valid @RequestBody DisableMfaRequest request) {
        mfa.disable(SecurityUtils.requireUser().id(), request.password(), request.code());
    }
}

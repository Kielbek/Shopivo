package pl.shopivo.authentication.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.authentication.internal.AuthenticationService;
import pl.shopivo.authentication.internal.CsrfTokenRotation;
import pl.shopivo.authentication.internal.MfaService;
import pl.shopivo.authentication.internal.SessionCookies;
import pl.shopivo.authentication.internal.SessionService;
import pl.shopivo.shared.security.CurrentUser;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.web.ClientInfo;
import pl.shopivo.users.PlatformRole;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserView;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication")
class AuthController {

    private final AuthenticationService auth;
    private final MfaService mfa;
    private final SessionCookies cookies;
    private final UserAccounts users;
    private final ObjectProvider<ClientRegistrationRepository> clientRegistrations;
    private final CsrfTokenRotation csrf;

    AuthController(AuthenticationService auth, MfaService mfa, SessionCookies cookies, UserAccounts users,
            ObjectProvider<ClientRegistrationRepository> clientRegistrations, CsrfTokenRotation csrf) {
        this.csrf = csrf;
        this.auth = auth;
        this.mfa = mfa;
        this.cookies = cookies;
        this.users = users;
        this.clientRegistrations = clientRegistrations;
    }

    record RegisterRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(max = 128) String password,
            @NotBlank @Size(max = 100) String firstName,
            @NotBlank @Size(max = 100) String lastName,
            @AssertTrue(message = "Akceptacja regulaminu jest wymagana") boolean acceptTerms) {
    }

    record EmailRequest(@NotBlank @Email @Size(max = 320) String email) {
    }

    record TokenRequest(@NotBlank @Size(max = 100) String token) {
    }

    record LoginRequest(@NotBlank @Size(max = 320) String email, @NotBlank @Size(max = 128) String password,
            boolean rememberMe) {
    }

    record LoginResponse(boolean mfaRequired) {
    }

    record MfaRequest(@NotBlank @Size(max = 20) String code) {
    }

    record ResetPasswordRequest(@NotBlank @Size(max = 100) String token, @NotBlank @Size(max = 128) String newPassword) {
    }

    record MeResponse(UUID id, String email, String firstName, String lastName, String locale,
            PlatformRole platformRole, boolean mfaEnabled, boolean mfaPending) {
    }

    record CsrfResponse(String headerName, String token) {
    }

    @GetMapping("/csrf")
    CsrfResponse csrf(CsrfToken token) {
        // Accessing the token makes Spring Security write the XSRF-TOKEN cookie.
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @GetMapping("/providers")
    List<String> providers() {
        List<String> providers = new ArrayList<>();
        if (clientRegistrations.getIfAvailable() instanceof InMemoryClientRegistrationRepository repo) {
            repo.forEach(r -> providers.add(r.getRegistrationId()));
        }
        return providers;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void register(@Valid @RequestBody RegisterRequest request, HttpServletRequest http) {
        auth.register(request.email(), request.password(), request.firstName(), request.lastName(), ClientInfo.from(http));
    }

    @PostMapping("/verify-email")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void verifyEmail(@Valid @RequestBody TokenRequest request) {
        auth.verifyEmail(request.token());
    }

    @PostMapping("/verify-email/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void resendVerification(@Valid @RequestBody EmailRequest request, HttpServletRequest http) {
        auth.resendVerification(request.email(), ClientInfo.from(http));
    }

    @PostMapping("/login")
    LoginResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http, HttpServletResponse response) {
        AuthenticationService.LoginResult result = auth.login(request.email(), request.password(), request.rememberMe(),
                ClientInfo.from(http));
        cookies.write(response, result.session());
        csrf.rotate(http, response);
        return new LoginResponse(result.mfaRequired());
    }

    @PostMapping("/login/mfa")
    LoginResponse loginMfa(@Valid @RequestBody MfaRequest request, HttpServletRequest http, HttpServletResponse response) {
        CurrentUser user = SecurityUtils.requireUser();
        SessionService.IssuedSession session = mfa.completeLogin(user.id(), user.sessionId(), request.code());
        cookies.write(response, session);
        csrf.rotate(http, response);
        return new LoginResponse(false);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(HttpServletRequest http, HttpServletResponse response) {
        auth.logout(SecurityUtils.requireUser().sessionId());
        cookies.clear(response);
        csrf.rotate(http, response);
    }

    @PostMapping("/password/forgot")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void forgotPassword(@Valid @RequestBody EmailRequest request, HttpServletRequest http) {
        auth.requestPasswordReset(request.email(), ClientInfo.from(http));
    }

    @PostMapping("/password/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        auth.resetPassword(request.token(), request.newPassword());
    }

    @GetMapping("/me")
    MeResponse me() {
        CurrentUser current = SecurityUtils.requireUser();
        UserView user = users.getById(current.id());
        return new MeResponse(user.id(), user.email(), user.firstName(), user.lastName(), user.locale(),
                current.platformRole() == null ? null : PlatformRole.valueOf(current.platformRole()),
                user.mfaEnabled(), current.mfaPending());
    }
}

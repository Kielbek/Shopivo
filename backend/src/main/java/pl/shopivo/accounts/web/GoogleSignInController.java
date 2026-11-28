package pl.shopivo.accounts.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.accounts.GoogleSignIn;

/** The store's Google sign-in keys (panel). The client secret is write-only: the response only says whether it is set. */
@RestController
@RequestMapping("/api/v1/tenants/{tenantId}/google-sign-in")
@Tag(name = "Storefront accounts")
class GoogleSignInController {

    private final GoogleSignIn google;

    GoogleSignInController(GoogleSignIn google) {
        this.google = google;
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    GoogleSignIn.Settings get(@PathVariable UUID tenantId) {
        return google.settings();
    }

    @PutMapping
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    GoogleSignIn.Settings save(@PathVariable UUID tenantId, @RequestBody GoogleSignIn.SettingsInput input) {
        return google.save(input);
    }

    @DeleteMapping
    @PreAuthorize("@tenantAccess.can('STORE_SETTINGS_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@PathVariable UUID tenantId) {
        google.remove();
    }
}

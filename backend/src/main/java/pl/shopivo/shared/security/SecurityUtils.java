package pl.shopivo.shared.security;

import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import pl.shopivo.shared.error.UnauthenticatedException;

public final class SecurityUtils {

    private SecurityUtils() {
    }

    public static Optional<CurrentUser> currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof CurrentUser user) {
            return Optional.of(user);
        }
        return Optional.empty();
    }

    public static CurrentUser requireUser() {
        return currentUser().orElseThrow(UnauthenticatedException::new);
    }
}

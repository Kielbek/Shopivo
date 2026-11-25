package pl.shopivo.authentication.internal;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import pl.shopivo.users.UserStatus;
import pl.shopivo.users.UserStatusChangedEvent;

/** Revokes all sessions synchronously (same transaction) when an account is suspended or deleted. */
@Component
class UserStatusListener {

    private final SessionService sessions;

    UserStatusListener(SessionService sessions) {
        this.sessions = sessions;
    }

    @EventListener
    void on(UserStatusChangedEvent event) {
        if (event.newStatus() == UserStatus.SUSPENDED || event.newStatus() == UserStatus.DELETED) {
            sessions.revokeAll(event.userId(), null, "ACCOUNT_" + event.newStatus());
        }
    }
}

package pl.shopivo.tenants.internal;

import java.time.Instant;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.util.UriComponentsBuilder;
import pl.shopivo.email.EmailMessage;
import pl.shopivo.email.EmailSender;
import pl.shopivo.email.EmailTemplates;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.crypto.Tokens;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.tenants.InvitationCreatedEvent;
import pl.shopivo.tenants.TenantInvitations;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserView;

/** Issues a fresh invitation token and e-mails it. Runs asynchronously after commit, in the tenant's context. */
@Component
class InvitationDeliveryListener {

    private static final Logger log = LoggerFactory.getLogger(InvitationDeliveryListener.class);

    private final InvitationRepository invitations;
    private final TenantRepository tenants;
    private final UserAccounts users;
    private final EmailTemplates templates;
    private final EmailSender sender;
    private final ShopivoProperties properties;
    private final TransactionTemplate tx;

    InvitationDeliveryListener(InvitationRepository invitations, TenantRepository tenants, UserAccounts users,
            EmailTemplates templates, EmailSender sender, ShopivoProperties properties, TransactionTemplate tx) {
        this.invitations = invitations;
        this.tenants = tenants;
        this.users = users;
        this.templates = templates;
        this.sender = sender;
        this.properties = properties;
        this.tx = tx;
    }

    /**
     * Async after-commit listener; the publication is tracked by the Modulith event registry (retried until it
     * completes). Not transactional itself, because the tenant context must be bound before a transaction starts.
     */
    @Async
    @TransactionalEventListener
    void on(InvitationCreatedEvent event) {
        TenantContext.runInTenant(event.tenantId(), () -> {
            EmailMessage message = tx.execute(s -> {
                InvitationEntity inv = invitations.findById(event.invitationId()).orElse(null);
                if (inv == null || !inv.isPending(Instant.now())) {
                    log.info("Invitation {} no longer pending, skipping delivery", event.invitationId());
                    return null;
                }
                String token = Tokens.newToken();
                inv.reissue(Tokens.sha256(token), Instant.now().plus(TenantInvitations.VALIDITY));
                String storeName = tenants.findById(event.tenantId()).map(TenantEntity::getName).orElse("Shopivo");
                String inviter = users.findById(inv.getInvitedBy()).map(UserView::fullName).orElse("Zespół sklepu");
                String link = UriComponentsBuilder.fromUriString(properties.appUrl()).path("/zaproszenie")
                        .queryParam("token", token).build().toUriString();
                return templates.render("invitation", inv.getEmail(), Map.of(
                        "storeName", storeName, "inviterName", inviter,
                        "roleLabel", inv.getRole().label(), "link", link));
            });
            if (message != null) {
                sender.send(message);
            }
        });
    }
}

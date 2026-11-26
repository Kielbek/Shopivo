package pl.shopivo.accounts.internal;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import pl.shopivo.accounts.CustomerAccounts.AccountMail;
import pl.shopivo.email.EmailSender;
import pl.shopivo.email.EmailTemplates;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.Stores;

/** Account e-mails in the name of the store, sent after commit. */
@Component
class AccountMailer {

    private final Stores stores;
    private final EmailTemplates templates;
    private final EmailSender sender;
    private final String urlTemplate;

    AccountMailer(Stores stores, EmailTemplates templates, EmailSender sender,
            @Value("${shopivo.storefront-url-template:https://{host}}") String urlTemplate) {
        this.stores = stores;
        this.templates = templates;
        this.sender = sender;
        this.urlTemplate = urlTemplate;
    }

    @Async
    @TransactionalEventListener
    void on(AccountMail mail) {
        StoreView store = TenantContext.callInTenant(mail.tenantId(), stores::current);
        String base = urlTemplate.replace("{host}", store.primaryHostname());
        Map<String, Object> vars = new HashMap<>();
        vars.put("storeName", store.name());
        switch (mail.kind()) {
            case VERIFY -> {
                vars.put("subject", "Potwierdź konto w sklepie " + store.name());
                vars.put("heading", "Potwierdź adres e-mail");
                vars.put("lines", List.of("Cześć " + mail.firstName() + ", dziękujemy za założenie konta w sklepie " + store.name() + ".",
                        "Kliknij przycisk i wpisz hasło podane przy rejestracji. Link jest ważny 48 godzin.",
                        "Jeśli to nie Ty zakładałeś(-aś) konto, zignoruj tę wiadomość — bez Twojego potwierdzenia konto nie zostanie aktywowane."));
                vars.put("actionUrl", base + "/konto/potwierdz#t=" + mail.token());
                vars.put("actionLabel", "Potwierdź konto");
            }
            case ALREADY_REGISTERED -> {
                vars.put("subject", "Masz już konto w sklepie " + store.name());
                vars.put("heading", "Masz już konto");
                vars.put("lines", List.of("Ktoś (być może Ty) próbował założyć konto na ten adres e-mail, ale konto już istnieje.",
                        "Zaloguj się lub ustaw nowe hasło, jeśli go nie pamiętasz. Jeśli to nie Ty — zignoruj tę wiadomość."));
                vars.put("actionUrl", base + "/konto/logowanie");
                vars.put("actionLabel", "Zaloguj się");
            }
            case RESET -> {
                vars.put("subject", "Nowe hasło do konta w sklepie " + store.name());
                vars.put("heading", "Ustaw nowe hasło");
                vars.put("lines", List.of("Otrzymaliśmy prośbę o zmianę hasła. Link jest ważny 1 godzinę i można go użyć raz.",
                        "Jeśli to nie Ty prosiłeś(-aś) o zmianę, zignoruj tę wiadomość — hasło pozostanie bez zmian."));
                vars.put("actionUrl", base + "/konto/nowe-haslo#t=" + mail.token());
                vars.put("actionLabel", "Ustaw nowe hasło");
            }
        }
        sender.send(templates.render("order-notice", mail.email(), vars));
    }
}

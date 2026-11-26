package pl.shopivo.newsletter.internal;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import pl.shopivo.email.EmailSender;
import pl.shopivo.email.EmailTemplates;
import pl.shopivo.newsletter.Newsletter.NewsletterMail;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.Stores;

/** Newsletter e-mails in the name of the store: confirmation link, then a welcome with a one-click unsubscribe link. */
@Component
class NewsletterMailer {

    private final Stores stores;
    private final EmailTemplates templates;
    private final EmailSender sender;
    private final String urlTemplate;

    NewsletterMailer(Stores stores, EmailTemplates templates, EmailSender sender,
            @Value("${shopivo.storefront-url-template:https://{host}}") String urlTemplate) {
        this.stores = stores;
        this.templates = templates;
        this.sender = sender;
        this.urlTemplate = urlTemplate;
    }

    @Async
    @TransactionalEventListener
    void on(NewsletterMail mail) {
        StoreView store = TenantContext.callInTenant(mail.tenantId(), stores::current);
        String base = urlTemplate.replace("{host}", store.primaryHostname());
        Map<String, Object> vars = new HashMap<>();
        vars.put("storeName", store.name());
        if (mail.kind() == NewsletterMail.Kind.CONFIRM) {
            vars.put("subject", "Potwierdź zapis na newsletter sklepu " + store.name());
            vars.put("heading", "Potwierdź zapis na newsletter");
            vars.put("lines", List.of("Ktoś (prawdopodobnie Ty) zapisał ten adres na newsletter sklepu " + store.name() + ".",
                    "Kliknij przycisk, aby potwierdzić. Link jest ważny 7 dni.",
                    "Jeśli to nie Ty — zignoruj tę wiadomość. Bez potwierdzenia nie wyślemy Ci żadnych informacji handlowych."));
            vars.put("actionUrl", base + "/newsletter#t=" + mail.token());
            vars.put("actionLabel", "Potwierdzam zapis");
        } else {
            vars.put("subject", "Zapisano na newsletter sklepu " + store.name());
            vars.put("heading", "Dziękujemy za zapis!");
            vars.put("lines", List.of("Od teraz będziesz otrzymywać nowości i promocje sklepu " + store.name() + ".",
                    "Możesz wypisać się w każdej chwili jednym kliknięciem — zachowaj tę wiadomość."));
            vars.put("actionUrl", base + "/newsletter?wypisz=1#t=" + mail.token());
            vars.put("actionLabel", "Wypisz się z newslettera");
        }
        sender.send(templates.render("order-notice", mail.email(), vars));
    }
}

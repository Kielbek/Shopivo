package pl.shopivo.subscriptions.internal;

import java.text.NumberFormat;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.email.EmailSender;
import pl.shopivo.email.EmailTemplates;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.Stores;
import pl.shopivo.tenants.TenantMemberships;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserView;

/** E-mails subscription notices to the store owners, asynchronously after commit. */
@Component
class SubscriptionNoticeMailer {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionNoticeMailer.class);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d.MM.yyyy").withZone(ZoneId.of("Europe/Warsaw"));

    private final TenantMemberships memberships;
    private final Stores stores;
    private final SubscriptionRepository subscriptions;
    private final ChargeRepository charges;
    private final PlanRepository plans;
    private final UserAccounts users;
    private final EmailTemplates templates;
    private final EmailSender sender;
    private final ShopivoProperties properties;
    private final TransactionTemplate tx;

    SubscriptionNoticeMailer(TenantMemberships memberships, Stores stores, SubscriptionRepository subscriptions,
            ChargeRepository charges, PlanRepository plans, UserAccounts users, EmailTemplates templates,
            EmailSender sender, ShopivoProperties properties, TransactionTemplate tx) {
        this.memberships = memberships;
        this.stores = stores;
        this.subscriptions = subscriptions;
        this.charges = charges;
        this.plans = plans;
        this.users = users;
        this.templates = templates;
        this.sender = sender;
        this.properties = properties;
        this.tx = tx;
    }

    record Content(List<String> recipients, Map<String, Object> variables) {
    }

    @Async
    @TransactionalEventListener
    void on(SubscriptionNotice notice) {
        TenantContext.runInTenant(notice.tenantId(), () -> {
            Content content = tx.execute(s -> build(notice));
            if (content == null) return;
            for (String to : content.recipients()) {
                sender.send(templates.render("subscription-notice", to, content.variables()));
            }
        });
    }

    private Content build(SubscriptionNotice notice) {
        SubscriptionEntity sub = subscriptions.findFirstBy().orElse(null);
        if (sub == null) return null;
        List<String> recipients = memberships.activeOwnerIds().stream()
                .map(users::findById).flatMap(java.util.Optional::stream).map(UserView::email).toList();
        if (recipients.isEmpty()) {
            log.warn("No active owner to notify about {} for tenant {}", notice.type(), notice.tenantId());
            return null;
        }
        String store = stores.current().name();
        String plan = plans.findById(sub.getPlanId()).map(PlanEntity::getName).orElse("");
        ChargeEntity charge = notice.chargeId() == null ? null : charges.findById(notice.chargeId()).orElse(null);
        String link = properties.appUrl() + "/sklep/" + notice.tenantId() + "/subskrypcja";
        List<String> lines = new ArrayList<>();
        String subject;
        String heading;
        String cta = "Przejdź do subskrypcji";
        switch (notice.type()) {
            case TRIAL_ENDING -> {
                subject = "Okres próbny sklepu " + store + " kończy się " + date(sub.getTrialEndsAt());
                heading = "Okres próbny wkrótce się skończy";
                lines.add("Okres próbny sklepu " + store + " kończy się " + date(sub.getTrialEndsAt()) + ".");
                lines.add("Wybierz plan i opłać subskrypcję, aby sklep działał bez przerwy. Niewykorzystane dni okresu próbnego zostaną zachowane.");
                cta = "Wybierz plan";
            }
            case TRIAL_EXPIRED -> {
                subject = "Okres próbny sklepu " + store + " zakończył się";
                heading = "Okres próbny zakończył się";
                lines.add("Sklep jest teraz w trybie tylko do odczytu, a strona sklepu jest niedostępna dla klientów.");
                lines.add("Twoje dane są bezpieczne — po opłaceniu subskrypcji wszystko wróci do działania od razu.");
                cta = "Wybierz plan";
            }
            case PAYMENT_DUE, PAYMENT_REMINDER -> {
                subject = (notice.type() == SubscriptionNotice.Type.PAYMENT_REMINDER ? "Przypomnienie: " : "")
                        + "płatność za subskrypcję sklepu " + store;
                heading = "Płatność za kolejny okres";
                if (charge != null) {
                    lines.add("Do zapłaty: " + money(charge.getTotalMinor(), charge.getCurrency()) + " brutto (" + charge.getNumber() + ").");
                    lines.add("Okres: " + date(charge.getPeriodStart()) + " – " + date(charge.getPeriodEnd()) + ", termin: " + date(charge.getDueAt()) + ".");
                }
                lines.add("Płatność zrealizujesz w panelu sklepu — wybierzesz tam wygodną metodę (BLIK, przelew, karta).");
                cta = "Opłać subskrypcję";
            }
            case PAYMENT_RECEIVED -> {
                subject = "Otrzymaliśmy płatność za subskrypcję sklepu " + store;
                heading = "Dziękujemy za płatność";
                if (charge != null) {
                    lines.add("Zaksięgowaliśmy " + money(charge.getTotalMinor(), charge.getCurrency()) + " (" + charge.getNumber() + ").");
                }
                lines.add("Plan " + plan + " jest aktywny" + (sub.getCurrentPeriodEnd() != null ? " do " + date(sub.getCurrentPeriodEnd()) : "") + ".");
            }
            case PAYMENT_FAILED -> {
                subject = "Płatność za subskrypcję sklepu " + store + " nie powiodła się";
                heading = "Płatność nie powiodła się";
                lines.add("Operator płatności odrzucił transakcję" + (charge != null ? " " + charge.getNumber() : "") + ". Spróbuj ponownie, wybierając inną metodę płatności.");
                cta = "Spróbuj ponownie";
            }
            case PAST_DUE -> {
                subject = "Subskrypcja sklepu " + store + " nie została opłacona";
                heading = "Brak płatności za nowy okres";
                lines.add("Sklep działa normalnie do " + date(sub.getGraceUntil()) + ". Jeśli do tego dnia płatność nie wpłynie, sklep przejdzie w tryb tylko do odczytu.");
                cta = "Opłać subskrypcję";
            }
            case EXPIRED -> {
                subject = "Subskrypcja sklepu " + store + " wygasła";
                heading = "Subskrypcja wygasła";
                lines.add("Sklep jest w trybie tylko do odczytu, a strona sklepu jest niedostępna dla klientów. Dane pozostają zachowane.");
                cta = "Odnów subskrypcję";
            }
            case CANCELED -> {
                subject = "Subskrypcja sklepu " + store + " została zakończona";
                heading = "Subskrypcja zakończona";
                lines.add("Zgodnie z Twoją decyzją subskrypcja została zakończona. Sklep jest w trybie tylko do odczytu.");
                lines.add("Możesz wrócić w każdej chwili — wystarczy wybrać plan.");
                cta = "Wybierz plan";
            }
            case FAIR_USE_EXCEEDED -> {
                subject = "Sklep " + store + " przekroczył limit uczciwego użytkowania planu";
                heading = "Twój sklep rośnie!";
                lines.add("W tym miesiącu sklep przekroczył limit uczciwego użytkowania planu " + plan + ". Sklep i zakupy klientów działają bez ograniczeń.");
                lines.add("Jeśli taki ruch się utrzyma, rozważ wyższy plan — skontaktujemy się z Tobą, zanim cokolwiek się zmieni.");
                cta = "Porównaj plany";
            }
            default -> {
                return null;
            }
        }
        Map<String, Object> vars = new HashMap<>();
        vars.put("subject", subject);
        vars.put("heading", heading);
        vars.put("lines", lines);
        vars.put("ctaLabel", cta);
        vars.put("link", link);
        return new Content(recipients, vars);
    }

    static String money(long minor, String currency) {
        NumberFormat f = NumberFormat.getNumberInstance(Locale.forLanguageTag("pl-PL"));
        f.setMinimumFractionDigits(2);
        f.setMaximumFractionDigits(2);
        return f.format(minor / 100.0) + " " + ("PLN".equals(currency) ? "zł" : currency);
    }

    static String date(Instant i) {
        return i == null ? "—" : DATE.format(i);
    }
}

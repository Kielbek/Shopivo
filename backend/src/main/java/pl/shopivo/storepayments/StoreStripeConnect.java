package pl.shopivo.storepayments;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.payments.GatewayException;
import pl.shopivo.payments.PaymentGatewayModels.InboundNotification;
import pl.shopivo.payments.StripeConnect;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.crypto.SecretEncryptor;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.Stores;
import tools.jackson.databind.json.JsonMapper;

/**
 * Connecting a store to Stripe through Shopivo's Connect platform: create the connected account once, send the merchant
 * to Stripe's hosted onboarding, read back the account status. Stripe's platform webhook lands here too — the event's
 * {@code account} picks the store (looked up across stores, the only cross-tenant step), then the store's own flow runs.
 */
@Service
public class StoreStripeConnect {

    static final String PROVIDER = "stripe";
    private static final Logger log = LoggerFactory.getLogger(StoreStripeConnect.class);

    private final StripeConnect stripe;
    private final StorePaymentProviders providers;
    private final StorePaymentNotifications notifications;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final SecretEncryptor encryptor;
    private final JsonMapper json;
    private final Stores stores;
    private final ShopivoProperties properties;
    private final AuditLog auditLog;
    private final String urlTemplate;

    StoreStripeConnect(StripeConnect stripe, StorePaymentProviders providers, StorePaymentNotifications notifications, JdbcTemplate jdbc,
            TransactionTemplate tx, SecretEncryptor encryptor, JsonMapper json, Stores stores, ShopivoProperties properties, AuditLog auditLog,
            @Value("${shopivo.storefront-url-template:https://{host}}") String urlTemplate) {
        this.stripe = stripe;
        this.providers = providers;
        this.notifications = notifications;
        this.jdbc = jdbc;
        this.tx = tx;
        this.encryptor = encryptor;
        this.json = json;
        this.stores = stores;
        this.properties = properties;
        this.auditLog = auditLog;
        this.urlTemplate = urlTemplate;
    }

    /** Platform readiness and (when connected) the store's account status as Stripe reports it. */
    public record StripeStatus(boolean platformConfigured, boolean testMode, boolean connected, boolean chargesEnabled,
            boolean payoutsEnabled, boolean detailsSubmitted, int requirementsDue, String disabledReason) {
    }

    public record OnboardingLink(String url) {
    }

    /**
     * Creates the connected account on first use (replacing another operator's settings — the store has one online
     * payment operator) and returns a fresh single-use onboarding link. Called outside a transaction (Stripe API calls).
     */
    public OnboardingLink start() {
        if (!stripe.configured()) {
            throw new BusinessRuleException("STRIPE_NOT_CONFIGURED", "Płatności Stripe nie są jeszcze włączone na platformie Shopivo.");
        }
        UUID tenant = TenantContext.requireTenantId();
        String accountId = tx.execute(s -> accountId()).orElse(null);
        try {
            if (accountId == null) {
                var store = tx.execute(s -> stores.current());
                String storeUrl = store.primaryHostname() == null ? null : urlTemplate.replace("{host}", store.primaryHostname());
                accountId = stripe.createAccount(store.contactEmail(), storeUrl, tenant);
                String created = accountId;
                tx.executeWithoutResult(s -> saveAccount(tenant, created));
                auditLog.record(AuditEntry.tenant("store.payments.stripe.account_created", tenant, "payment_provider", null));
            }
            String base = properties.appUrl() + "/sklep/" + tenant + "/platnosci";
            return new OnboardingLink(stripe.onboardingLink(accountId, base + "?stripe=odswiez", base + "?stripe=powrot"));
        } catch (GatewayException e) {
            throw new BusinessRuleException("STRIPE_ERROR", "Stripe: " + e.getMessage());
        }
    }

    /** Reads the account from Stripe and stores whether it can take payments (also called by account.updated). */
    public StripeStatus refresh() {
        Optional<String> accountId = tx.execute(s -> accountId());
        if (accountId.isEmpty()) return status();
        StripeConnect.AccountStatus a;
        try {
            a = stripe.account(accountId.get());
        } catch (GatewayException e) {
            throw new BusinessRuleException("STRIPE_ERROR", "Stripe: " + e.getMessage());
        }
        tx.executeWithoutResult(s -> apply(a));
        return toStatus(a);
    }

    /** Current status without calling Stripe (verified = Stripe allowed charges at the last check). */
    public StripeStatus status() {
        Optional<StorePaymentProviders.Stored> s = tx.execute(st -> providers.stored().filter(p -> PROVIDER.equals(p.providerId())));
        boolean connected = s.isPresent();
        boolean charges = connected && s.get().verifiedAt() != null;
        return new StripeStatus(stripe.configured(), stripe.testMode(), connected, charges, false, charges, 0, null);
    }

    /**
     * Platform webhook (Connect endpoint): signature with the platform's endpoint secret, the store found by the event's
     * connected account. Checkout events go through the store's payment flow; account.updated refreshes the status.
     */
    public void receive(InboundNotification inbound) {
        StripeConnect.ConnectEvent event = stripe.verifyEvent(inbound.body(), inbound.header("Stripe-Signature"));
        if (event.account() == null) return; // platform-level event: nothing to do for stores
        UUID tenant = TenantContext.callAsSystem(() -> tx.execute(s -> jdbc.query(
                "select tenant_id from store_payment_providers where provider_id = ? and external_account_id = ?",
                (rs, i) -> rs.getObject(1, UUID.class), PROVIDER, event.account()).stream().findFirst().orElse(null)));
        if (tenant == null) {
            log.info("Stripe event {} for an account not connected to any store", event.type());
            return;
        }
        if (event.type().startsWith("checkout.session.")) {
            notifications.receive(tenant, PROVIDER, inbound);
        } else if (event.type().equals("account.updated")) {
            TenantContext.runInTenant(tenant, () -> {
                try {
                    refresh();
                } catch (BusinessRuleException e) {
                    log.warn("Refreshing Stripe account of store {} failed: {}", tenant, e.getMessage());
                }
            });
        }
    }

    private Optional<String> accountId() {
        return jdbc.query("select external_account_id from store_payment_providers where tenant_id = ? and provider_id = ?",
                (rs, i) -> rs.getString(1), TenantContext.requireTenantId(), PROVIDER).stream().findFirst();
    }

    private void saveAccount(UUID tenant, String accountId) {
        String encrypted = encryptor.encrypt(json.writeValueAsString(Map.of("accountId", accountId)), "store-payment-provider:" + tenant + ":" + PROVIDER);
        jdbc.update("""
                insert into store_payment_providers (tenant_id, provider_id, credentials_enc, sandbox, enabled, external_account_id)
                values (?, ?, ?, ?, false, ?)
                on conflict (tenant_id) do update set provider_id = excluded.provider_id, credentials_enc = excluded.credentials_enc,
                    sandbox = excluded.sandbox, enabled = false, verified_at = null, external_account_id = excluded.external_account_id,
                    updated_at = now(), version = store_payment_providers.version + 1
                """, tenant, PROVIDER, encrypted, stripe.testMode(), accountId);
    }

    /** Charges allowed → verified (the merchant then switches payments on); charges blocked → payments off. */
    private void apply(StripeConnect.AccountStatus a) {
        UUID tenant = TenantContext.requireTenantId();
        if (a.chargesEnabled()) {
            jdbc.update("update store_payment_providers set verified_at = coalesce(verified_at, now()) where tenant_id = ? and provider_id = ?",
                    tenant, PROVIDER);
        } else {
            int changed = jdbc.update("""
                    update store_payment_providers set verified_at = null, enabled = false, updated_at = now(), version = version + 1
                    where tenant_id = ? and provider_id = ? and (verified_at is not null or enabled)
                    """, tenant, PROVIDER);
            if (changed > 0) auditLog.record(AuditEntry.tenant("store.payments.stripe.charges_disabled", tenant, "payment_provider", null));
        }
    }

    private StripeStatus toStatus(StripeConnect.AccountStatus a) {
        return new StripeStatus(stripe.configured(), stripe.testMode(), true, a.chargesEnabled(), a.payoutsEnabled(), a.detailsSubmitted(),
                a.requirementsDue(), a.disabledReason());
    }
}

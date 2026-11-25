package pl.shopivo.billing;

import java.util.Optional;
import pl.shopivo.billing.internal.PlatformProviderRepository;
import pl.shopivo.billing.internal.ProviderCredentials;
import pl.shopivo.payments.GatewayException;
import pl.shopivo.payments.PaymentGatewayModels.PaymentLink;
import pl.shopivo.payments.PaymentGatewayModels.PaymentRequest;
import pl.shopivo.payments.PaymentGateways;
import pl.shopivo.shared.config.ShopivoProperties;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates payment links for subscription charges with the operator selected by the platform administrator. */
@Service
public class BillingPayments {

    private final PlatformProviderRepository providers;
    private final ProviderCredentials credentials;
    private final PaymentGateways gateways;
    private final ShopivoProperties properties;

    BillingPayments(PlatformProviderRepository providers, ProviderCredentials credentials, PaymentGateways gateways,
            ShopivoProperties properties) {
        this.providers = providers;
        this.credentials = credentials;
        this.gateways = gateways;
        this.properties = properties;
    }

    public record PaymentSpec(String externalId, long amountMinor, String currency, String description,
            String customerEmail, String customerName, String customerIp, String returnUrl) {
    }

    public record CreatedPayment(String provider, String url, String providerPaymentId) {
    }

    /** Operator currently used for subscription payments, if the administrator configured one. */
    @Transactional(readOnly = true)
    public Optional<String> activeProvider() {
        return providers.findActive().filter(p -> p.isEnabled() && gateways.find(p.getProvider()).isPresent())
                .map(p -> p.getProvider());
    }

    @Transactional(readOnly = true)
    public CreatedPayment create(PaymentSpec spec) {
        var provider = providers.findActive().filter(p -> p.isEnabled())
                .orElseThrow(() -> new GatewayException(
                        "Płatności za subskrypcje nie są jeszcze skonfigurowane. Skontaktuj się z obsługą Shopivo."));
        var gateway = gateways.get(provider.getProvider());
        String notifyUrl = properties.publicApiUrl() + "/api/v1/webhooks/billing/" + provider.getProvider();
        PaymentLink link = gateway.createPayment(credentials.context(provider), new PaymentRequest(spec.externalId(),
                spec.amountMinor(), spec.currency(), spec.description(), spec.customerEmail(), spec.customerName(),
                spec.customerIp(), spec.returnUrl(), notifyUrl));
        return new CreatedPayment(provider.getProvider(), link.redirectUrl(), link.providerPaymentId());
    }
}

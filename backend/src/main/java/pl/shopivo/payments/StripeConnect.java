package pl.shopivo.payments;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Shopivo's Stripe Connect platform account (docs.stripe.com/connect). Each store is a connected account with the full
 * Stripe Dashboard: Stripe collects the verification data (Connect Onboarding), the store pays Stripe's fees and Stripe
 * carries negative-balance liability (API defaults). Payments are direct charges — a Checkout Session created on the
 * store's account with the {@code Stripe-Account} header. Only the platform secret key (server configuration, never in the
 * database) authenticates; connected accounts are referenced by their {@code acct_…} id.
 */
@Component
public class StripeConnect {

    /** API version the request formats below were written against (sent on every call). */
    public static final String API_VERSION = "2026-11-18.endive";
    /** Accepted clock skew of webhook signatures (Stripe libraries default to 5 minutes). */
    static final long TOLERANCE_SECONDS = 300;

    private final RestClient.Builder http;
    private final JsonMapper json;
    private final String secretKey;
    private final String webhookSecret;
    private final String apiBase;
    private final int applicationFeeBps;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    StripeConnect(@org.springframework.beans.factory.annotation.Qualifier("paymentOperatorsHttp") RestClient.Builder http, JsonMapper json, @Value("${shopivo.stripe.secret-key:}") String secretKey,
            @Value("${shopivo.stripe.connect-webhook-secret:}") String webhookSecret,
            @Value("${shopivo.stripe.api-base:https://api.stripe.com}") String apiBase,
            @Value("${shopivo.stripe.application-fee-bps:0}") int applicationFeeBps) {
        this(http, json, secretKey, webhookSecret, apiBase, applicationFeeBps, Clock.systemUTC());
    }

    public StripeConnect(RestClient.Builder http, JsonMapper json, String secretKey, String webhookSecret, String apiBase,
            int applicationFeeBps, Clock clock) {
        this.http = http;
        this.json = json;
        this.secretKey = secretKey == null ? "" : secretKey.strip();
        this.webhookSecret = webhookSecret == null ? "" : webhookSecret.strip();
        this.apiBase = apiBase;
        this.applicationFeeBps = Math.clamp(applicationFeeBps, 0, 2000);
        this.clock = clock;
    }

    /** The platform has a secret key and a Connect webhook secret. Without them the Stripe option is shown as unavailable. */
    public boolean configured() {
        return !secretKey.isEmpty() && !webhookSecret.isEmpty();
    }

    /** Test-mode key (sk_test_…): accounts and payments are Stripe sandbox objects. */
    public boolean testMode() {
        return secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_");
    }

    public record AccountStatus(String id, boolean chargesEnabled, boolean payoutsEnabled, boolean detailsSubmitted,
            int requirementsDue, String disabledReason) {
    }

    public record Checkout(String id, String url) {
    }

    public record ConnectEvent(String id, String type, String account, JsonNode object) {
    }

    /** Creates the store's connected account (country PL) requesting card, BLIK and Przelewy24 payments. */
    public String createAccount(String email, String storeUrl, UUID tenantId) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("country", "PL");
        if (email != null && !email.isBlank()) form.put("email", email);
        form.put("controller[stripe_dashboard][type]", "full");
        form.put("controller[fees][payer]", "account");
        form.put("controller[losses][payments]", "stripe");
        form.put("controller[requirement_collection]", "stripe");
        form.put("capabilities[card_payments][requested]", "true");
        form.put("capabilities[transfers][requested]", "true");
        form.put("capabilities[blik_payments][requested]", "true");
        form.put("capabilities[p24_payments][requested]", "true");
        if (storeUrl != null && storeUrl.startsWith("https://")) form.put("business_profile[url]", storeUrl);
        form.put("metadata[shopivo_tenant_id]", tenantId.toString());
        return post("/v1/accounts", form, null).path("id").asString();
    }

    /** Single-use Connect Onboarding URL (type account_onboarding). */
    public String onboardingLink(String accountId, String refreshUrl, String returnUrl) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("account", accountId);
        form.put("refresh_url", refreshUrl);
        form.put("return_url", returnUrl);
        form.put("type", "account_onboarding");
        return post("/v1/account_links", form, null).path("url").asString();
    }

    public AccountStatus account(String accountId) {
        JsonNode a = call(() -> client().get().uri("/v1/accounts/{id}", accountId).retrieve().body(String.class));
        JsonNode req = a.path("requirements");
        int due = req.path("currently_due").size() + req.path("past_due").size();
        String disabled = req.path("disabled_reason").isNull() ? null : req.path("disabled_reason").asString(null);
        return new AccountStatus(a.path("id").asString(), a.path("charges_enabled").asBoolean(), a.path("payouts_enabled").asBoolean(),
                a.path("details_submitted").asBoolean(), due, disabled);
    }

    /** Direct charge: Checkout Session on the connected account; the platform fee (if configured) as application_fee_amount. */
    public Checkout createCheckout(String accountId, PaymentGatewayModels.PaymentRequest r) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("mode", "payment");
        form.put("line_items[0][price_data][currency]", r.currency().toLowerCase(java.util.Locale.ROOT));
        form.put("line_items[0][price_data][product_data][name]", r.description());
        form.put("line_items[0][price_data][unit_amount]", Long.toString(r.amountMinor()));
        form.put("line_items[0][quantity]", "1");
        form.put("success_url", r.returnUrl());
        form.put("cancel_url", r.returnUrl());
        form.put("client_reference_id", r.externalId());
        form.put("metadata[shopivo_payment_id]", r.externalId());
        form.put("payment_intent_data[metadata][shopivo_payment_id]", r.externalId());
        if (r.customerEmail() != null && !r.customerEmail().isBlank()) form.put("customer_email", r.customerEmail());
        form.put("locale", "pl");
        long fee = r.amountMinor() * applicationFeeBps / 10_000;
        if (fee > 0 && fee < r.amountMinor()) form.put("payment_intent_data[application_fee_amount]", Long.toString(fee));
        JsonNode s = post("/v1/checkout/sessions", form, accountId);
        return new Checkout(s.path("id").asString(), s.path("url").asString());
    }

    /**
     * Verifies {@code Stripe-Signature} (t=…, v1=…): HMAC-SHA256 of "t.payload" with the Connect endpoint secret, compared
     * in constant time with every v1 entry, timestamp within {@value #TOLERANCE_SECONDS} s. Then parses the event.
     */
    public ConnectEvent verifyEvent(String payload, String signatureHeader) {
        if (webhookSecret.isEmpty()) throw new InvalidNotificationException("Stripe webhook secret not configured");
        if (payload == null || signatureHeader == null) throw new InvalidNotificationException("Missing Stripe signature");
        String timestamp = null;
        List<String> signatures = new ArrayList<>();
        for (String part : signatureHeader.split(",")) {
            int eq = part.indexOf('=');
            if (eq <= 0) continue;
            String k = part.substring(0, eq).strip();
            String v = part.substring(eq + 1).strip();
            if (k.equals("t")) timestamp = v;
            else if (k.equals("v1")) signatures.add(v);
        }
        if (timestamp == null || signatures.isEmpty()) throw new InvalidNotificationException("Malformed Stripe signature");
        String expected = hmac(webhookSecret, timestamp + "." + payload);
        boolean match = signatures.stream().anyMatch(s -> java.security.MessageDigest.isEqual(
                s.getBytes(StandardCharsets.US_ASCII), expected.getBytes(StandardCharsets.US_ASCII)));
        if (!match) throw new InvalidNotificationException("Stripe signature mismatch");
        long t;
        try {
            t = Long.parseLong(timestamp);
        } catch (NumberFormatException e) {
            throw new InvalidNotificationException("Malformed Stripe timestamp");
        }
        if (Math.abs(clock.instant().getEpochSecond() - t) > TOLERANCE_SECONDS) throw new InvalidNotificationException("Stripe signature too old");
        JsonNode e = json.readTree(payload);
        return new ConnectEvent(e.path("id").asString(), e.path("type").asString(), e.path("account").asString(null),
                e.path("data").path("object"));
    }

    /** For tests and the local simulator. */
    public static String sign(String secret, long timestamp, String payload) {
        return "t=" + timestamp + ",v1=" + hmac(secret, timestamp + "." + payload);
    }

    static String hmac(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return java.util.HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    // ------------------------------------------------------------------ HTTP

    private RestClient client() {
        if (secretKey.isEmpty()) throw new GatewayException("Płatności Stripe nie są skonfigurowane na platformie.");
        return http.clone().baseUrl(apiBase)
                .defaultHeaders(h -> {
                    h.setBasicAuth(secretKey, "");
                    h.set("Stripe-Version", API_VERSION);
                }).build();
    }

    private JsonNode post(String path, Map<String, String> form, String stripeAccount) {
        String body = encode(form);
        return call(() -> {
            var req = client().post().uri(path).contentType(MediaType.APPLICATION_FORM_URLENCODED);
            if (stripeAccount != null) req = req.header("Stripe-Account", stripeAccount);
            return req.body(body).retrieve().body(String.class);
        });
    }

    private JsonNode call(java.util.function.Supplier<String> request) {
        try {
            return json.readTree(request.get());
        } catch (RestClientResponseException e) {
            String message;
            try {
                message = json.readTree(e.getResponseBodyAsString()).path("error").path("message").asString("");
            } catch (RuntimeException parse) {
                message = "";
            }
            throw new GatewayException(message.isBlank() ? "Stripe odrzucił żądanie (HTTP " + e.getStatusCode().value() + ")." : message);
        } catch (org.springframework.web.client.RestClientException e) {
            throw new GatewayException("Brak połączenia ze Stripe. Spróbuj ponownie za chwilę.");
        }
    }

    static String encode(Map<String, String> form) {
        StringBuilder sb = new StringBuilder();
        form.forEach((k, v) -> {
            if (sb.length() > 0) sb.append('&');
            sb.append(URLEncoder.encode(k, StandardCharsets.UTF_8)).append('=').append(URLEncoder.encode(v, StandardCharsets.UTF_8));
        });
        return sb.toString();
    }
}

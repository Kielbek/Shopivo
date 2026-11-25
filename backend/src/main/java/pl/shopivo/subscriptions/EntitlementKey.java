package pl.shopivo.subscriptions;

import java.util.Arrays;
import java.util.Optional;

/**
 * Known plan entitlements. Values are stored as text per plan ({@code plan_entitlements}) and can be overridden per
 * tenant. For numeric kinds {@code -1} means unlimited.
 *
 * <ul>
 *   <li>{@link Kind#LIMIT} — hard limit, the action is refused (HTTP 402) when reached.</li>
 *   <li>{@link Kind#FAIR_USE} — soft monthly limit: never blocks the store or its customers; exceeding it notifies the
 *   merchant and flags the store for the platform (upgrade conversation).</li>
 *   <li>{@link Kind#FEATURE} — on/off.</li>
 *   <li>{@link Kind#NUMBER} — plain parameter (e.g. transaction fee).</li>
 * </ul>
 */
public enum EntitlementKey {
    PRODUCTS_MAX("products.max", Kind.LIMIT, "Produkty", null),
    STAFF_MAX("staff.max", Kind.LIMIT, "Osoby w zespole (z właścicielem)", null),
    STORAGE_MAX_MB("storage.max_mb", Kind.LIMIT, "Miejsce na pliki", null),
    ORDERS_FAIR_USE("orders.monthly.fair_use", Kind.FAIR_USE, "Zamówienia miesięcznie", "orders"),
    STOREFRONT_REQUESTS_FAIR_USE("storefront.requests.monthly.fair_use", Kind.FAIR_USE, "Odsłony sklepu miesięcznie", "storefront.requests"),
    AI_MONTHLY_CREDITS("ai.monthly_credits", Kind.LIMIT, "Kredyty AI miesięcznie", "ai.credits"),
    TRANSACTION_FEE_BPS("fees.transaction_bps", Kind.NUMBER, "Prowizja od sprzedaży (pkt bazowe)", null),
    CUSTOM_DOMAINS("domains.custom", Kind.FEATURE, "Własna domena", null),
    PREMIUM_THEMES("themes.premium", Kind.FEATURE, "Motywy premium", null),
    MARKETING_TOOLS("marketing.tools", Kind.FEATURE, "Narzędzia marketingowe", null),
    EXTERNAL_INTEGRATIONS("integrations.external", Kind.FEATURE, "Integracje zewnętrzne", null),
    ADVANCED_ANALYTICS("analytics.advanced", Kind.FEATURE, "Zaawansowane statystyki", null),
    PRIORITY_SUPPORT("support.priority", Kind.FEATURE, "Priorytetowe wsparcie", null);

    public enum Kind { LIMIT, FAIR_USE, FEATURE, NUMBER }

    private final String key;
    private final Kind kind;
    private final String label;
    private final String usageMetric;

    EntitlementKey(String key, Kind kind, String label, String usageMetric) {
        this.key = key;
        this.kind = kind;
        this.label = label;
        this.usageMetric = usageMetric;
    }

    public String key() { return key; }
    public Kind kind() { return kind; }
    public String label() { return label; }
    /** Monthly usage metric measured for this entitlement, if any. */
    public String usageMetric() { return usageMetric; }

    public static Optional<EntitlementKey> of(String key) {
        return Arrays.stream(values()).filter(k -> k.key.equals(key)).findFirst();
    }

    /** Validates a value for this key; returns the normalised value or throws IllegalArgumentException. */
    public String normalise(String value) {
        String v = value == null ? "" : value.trim().toLowerCase();
        if (kind == Kind.FEATURE) {
            if (!v.equals("true") && !v.equals("false")) throw new IllegalArgumentException(label + ": wartość tak/nie");
            return v;
        }
        try {
            long n = Long.parseLong(v);
            if (n < -1 || (kind == Kind.NUMBER && n < 0)) throw new IllegalArgumentException(label + ": nieprawidłowa liczba");
            return Long.toString(n);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(label + ": wymagana liczba całkowita (-1 = bez limitu)");
        }
    }
}

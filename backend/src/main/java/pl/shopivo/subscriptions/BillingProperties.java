package pl.shopivo.subscriptions;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Subscription billing settings ({@code shopivo.billing.*}). Plans, prices and limits are data (admin panel); only
 * the lifecycle timing, tax and the cost model used for profitability estimates are configuration.
 */
@ConfigurationProperties(prefix = "shopivo.billing")
public record BillingProperties(
        /** Plan assigned to new stores for the trial period. */
        @DefaultValue("BUSINESS") String trialPlanCode,
        /** Renewal charge is issued this long before the period ends. */
        @DefaultValue("7d") Duration renewalLead,
        /** After an unpaid period end the store keeps full access for this long (PAST_DUE). */
        @DefaultValue("7d") Duration gracePeriod,
        /** "Trial ends soon" notice is sent this long before the trial ends. */
        @DefaultValue("3d") Duration trialEndingNotice,
        /** Minimum time between payment reminders for the same charge. */
        @DefaultValue("3d") Duration reminderInterval,
        @DefaultValue("3") int maxReminders,
        /** VAT rate applied to subscription charges, in basis points (2300 = 23%). Plan prices are net. */
        @DefaultValue("2300") int vatRateBps,
        @DefaultValue("PLN") String currency,
        @DefaultValue CostModel costModel) {

    /**
     * Estimated infrastructure cost per tenant (grosze), used only for the profitability report. Calibrate with real
     * cloud invoices — the defaults are rough placeholders.
     */
    public record CostModel(
            @DefaultValue("300") long baseMonthlyMinor,
            @DefaultValue("200") long perMillionStorefrontRequestsMinor,
            @DefaultValue("2") long perOrderMinor,
            @DefaultValue("10") long perGbStorageMinor) {
    }
}

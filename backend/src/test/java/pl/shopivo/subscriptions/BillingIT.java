package pl.shopivo.subscriptions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import pl.shopivo.payments.internal.FakeGatewayAccess;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.usage.UsageRecorder;
import pl.shopivo.subscriptions.internal.SubscriptionLifecycleJob;
import pl.shopivo.subscriptions.internal.UsageJobs;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;
import tools.jackson.databind.JsonNode;

/**
 * Subscription billing end to end: trial, checkout through the (simulated) operator, signed notifications,
 * lifecycle transitions, read-only mode, plan limits, admin operations and usage metering.
 */
class BillingIT extends IntegrationTest {

    private static final String SECRET = "test-billing-secret";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    SubscriptionLifecycleJob lifecycle;
    @Autowired
    UsageJobs usageJobs;
    @Autowired
    UsageRecorder usageRecorder;

    private ApiClient admin;

    @BeforeEach
    void configureOperator() {
        admin = login("admin@shopivo.test", "Platforma!Testowa-2026");
        var saved = admin.put("/api/v1/admin/payment-providers/fake",
                Map.of("enabled", true, "sandbox", true, "credentials", Map.of("secret", SECRET)));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        assertThat(admin.post("/api/v1/admin/payment-providers/fake/activate", Map.of()).status()).isEqualTo(200);
    }

    // ------------------------------------------------------------------------------------------------ tests

    @Test
    void trialCheckoutAndSignedNotificationActivateSubscription() throws Exception {
        String email = uniqueEmail("billing");
        ApiClient owner = registeredUser(email);
        String tenant = createStore(owner, "Sklep Rozliczeń", uniqueSlug("bill"));

        JsonNode sub = owner.get(base(tenant)).json();
        assertThat(sub.get("status").asString()).isEqualTo("TRIALING");
        assertThat(sub.get("plan").get("code").asString()).isEqualTo("BUSINESS");
        assertThat(sub.get("access").asString()).isEqualTo("FULL");
        assertThat(sub.get("paymentsAvailable").asBoolean()).isTrue();

        var plans = client().get("/api/v1/plans");
        assertThat(plans.status()).isEqualTo(200);
        assertThat(plans.body()).contains("STARTER", "BUSINESS", "PROFESSIONAL", "staff.max");

        // Changing one's mind before paying replaces the open charge
        var first = owner.post(base(tenant) + "/checkout", Map.of("planCode", "PROFESSIONAL", "interval", "MONTH"));
        assertThat(first.status()).as(first.body()).isEqualTo(200);
        var checkout = owner.post(base(tenant) + "/checkout", Map.of("planCode", "STARTER", "interval", "MONTH"));
        assertThat(checkout.status()).as(checkout.body()).isEqualTo(200);
        assertThat(owner.get(base(tenant)).json().get("unpaidCharges").size()).isEqualTo(1);
        JsonNode charge = checkout.json().get("charge");
        assertThat(charge.get("amountMinor").asLong()).isEqualTo(7900);
        assertThat(charge.get("taxMinor").asLong()).isEqualTo(1817);
        assertThat(charge.get("totalMinor").asLong()).isEqualTo(9717);
        assertThat(checkout.json().get("paymentUrl").asString()).startsWith("https://app.shopivo.test/sklep/" + tenant + "/subskrypcja");
        String chargeId = charge.get("id").asString();

        // Forged notification → rejected, nothing changes
        assertThat(notify(chargeId, "pay-1", 9717, "PAID", "wrong-secret").getStatus()).isEqualTo(400);
        // Wrong amount → acknowledged but not applied
        assertThat(notify(chargeId, "pay-2", 100, "PAID", SECRET).getStatus()).isEqualTo(200);
        assertThat(owner.get(base(tenant)).json().get("status").asString()).isEqualTo("TRIALING");
        assertThat(owner.get(base(tenant) + "/history").body()).contains("PAYMENT_AMOUNT_MISMATCH");

        assertThat(notify(chargeId, "pay-3", 9717, "PAID", SECRET).getStatus()).isEqualTo(200);
        assertThat(notify(chargeId, "pay-3", 9717, "PAID", SECRET).getStatus()).isEqualTo(200); // duplicate delivery

        sub = owner.get(base(tenant)).json();
        assertThat(sub.get("status").asString()).isEqualTo("ACTIVE");
        assertThat(sub.get("plan").get("code").asString()).isEqualTo("STARTER");
        // Paid during the trial: the remaining trial days are kept, the paid period starts when the trial ends.
        assertThat(Instant.parse(sub.get("currentPeriodStart").asString())).isAfter(Instant.now().plus(13, ChronoUnit.DAYS));
        var charges = owner.get(base(tenant) + "/charges").json();
        assertThat(charges.size()).isEqualTo(2);
        assertThat(charges.get(0).get("status").asString()).isEqualTo("PAID");
        assertThat(charges.get(1).get("status").asString()).isEqualTo("VOID");
        assertThat(emails.awaitEmail(email, "Otrzymaliśmy płatność").textBody()).contains("97,17 zł");

        // Another store's member cannot see this subscription; only BILLING_MANAGE can pay
        ApiClient stranger = registeredUser(uniqueEmail("stranger"));
        assertThat(stranger.get(base(tenant)).status()).isEqualTo(404);
        assertThat(stranger.post(base(tenant) + "/charges/" + chargeId + "/pay", Map.of()).status()).isEqualTo(404);
    }

    @Test
    void expiredTrialMakesStoreReadOnlyAndUnavailableButBillingStillWorks() throws Exception {
        String email = uniqueEmail("expired");
        ApiClient owner = registeredUser(email);
        String slug = uniqueSlug("exp");
        String tenant = createStore(owner, "Sklep Wygasły", slug);
        sql("update subscriptions set trial_ends_at = now() - interval '1 minute' where tenant_id = ?", UUID.fromString(tenant));

        lifecycle.runAt(Instant.now());

        JsonNode sub = owner.get(base(tenant)).json();
        assertThat(sub.get("status").asString()).isEqualTo("EXPIRED");
        assertThat(sub.get("access").asString()).isEqualTo("READ_ONLY");
        assertThat(emails.awaitEmail(email, "zakończył się").textBody()).contains("tylko do odczytu");

        var write = owner.patch("/api/v1/tenants/" + tenant + "/store", Map.of("name", "Zmiana", "defaultLocale", "pl-PL",
                "defaultCurrency", "PLN", "timezone", "Europe/Warsaw", "version", 0));
        assertThat(write.status()).isEqualTo(402);
        assertThat(write.code()).isEqualTo("SUBSCRIPTION_INACTIVE");
        assertThat(owner.get("/api/v1/tenants/" + tenant + "/store").status()).isEqualTo(200);
        assertThat(storefront(slug + ".shopivo.test").getStatus()).isEqualTo(404);

        // The billing path stays writable, so the merchant can pay and get the store back immediately
        var checkout = owner.post(base(tenant) + "/checkout", Map.of("planCode", "BUSINESS", "interval", "YEAR"));
        assertThat(checkout.status()).as(checkout.body()).isEqualTo(200);
        JsonNode charge = checkout.json().get("charge");
        assertThat(notify(charge.get("id").asString(), "pay-exp", charge.get("totalMinor").asLong(), "PAID", SECRET).getStatus()).isEqualTo(200);

        sub = owner.get(base(tenant)).json();
        assertThat(sub.get("status").asString()).isEqualTo("ACTIVE");
        assertThat(sub.get("interval").asString()).isEqualTo("YEAR");
        assertThat(Instant.parse(sub.get("currentPeriodStart").asString())).isBefore(Instant.now().plusSeconds(5));
        assertThat(owner.get("/api/v1/tenants/" + tenant + "/store").json().get("version").asLong()).isZero();
        var store = owner.get("/api/v1/tenants/" + tenant + "/store").json();
        assertThat(owner.patch("/api/v1/tenants/" + tenant + "/store", Map.of("name", "Znowu działa", "defaultLocale", "pl-PL",
                "defaultCurrency", "PLN", "timezone", "Europe/Warsaw", "version", store.get("version").asLong())).status()).isEqualTo(200);
        assertThat(storefront(slug + ".shopivo.test").getStatus()).isEqualTo(200);
    }

    @Test
    void unpaidRenewalGoesPastDueThenExpires() throws Exception {
        String email = uniqueEmail("renew");
        ApiClient owner = registeredUser(email);
        String tenant = createStore(owner, "Sklep Odnowień", uniqueSlug("ren"));
        UUID tenantId = UUID.fromString(tenant);
        activate(owner, tenant, "STARTER", "MONTH");
        sql("update subscriptions set current_period_start = now() - interval '25 days', current_period_end = now() + interval '5 days' where tenant_id = ?", tenantId);

        lifecycle.runAt(Instant.now());
        var charges = owner.get(base(tenant) + "/charges").json();
        JsonNode renewal = find(charges, "RENEWAL");
        assertThat(renewal.get("status").asString()).isEqualTo("OPEN");
        assertThat(emails.awaitEmail(email, "płatność za subskrypcję").textBody()).contains("97,17 zł");
        lifecycle.runAt(Instant.now()); // idempotent — no second renewal charge
        assertThat(owner.get(base(tenant) + "/charges").json().size()).isEqualTo(2);

        sql("update subscriptions set current_period_end = now() - interval '1 minute' where tenant_id = ?", tenantId);
        lifecycle.runAt(Instant.now());
        JsonNode sub = owner.get(base(tenant)).json();
        assertThat(sub.get("status").asString()).isEqualTo("PAST_DUE");
        assertThat(sub.get("access").asString()).isEqualTo("FULL"); // grace period
        assertThat(sub.get("unpaidCharges").size()).isEqualTo(1);
        assertThat(Instant.parse(sub.get("unpaidCharges").get(0).get("periodStart").asString()))
                .isEqualTo(Instant.parse(sub.get("currentPeriodEnd").asString()));

        sql("update subscriptions set grace_until = now() - interval '1 minute' where tenant_id = ?", tenantId);
        lifecycle.runAt(Instant.now());
        sub = owner.get(base(tenant)).json();
        assertThat(sub.get("status").asString()).isEqualTo("EXPIRED");
        assertThat(sub.get("access").asString()).isEqualTo("READ_ONLY");
        assertThat(find(owner.get(base(tenant) + "/charges").json(), "RENEWAL").get("status").asString()).isEqualTo("VOID");
        assertThat(emails.awaitEmail(email, "wygasła").textBody()).contains("tylko do odczytu");
    }

    @Test
    void renewalPaidInAdvanceRollsOverAtPeriodEnd() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("advance"));
        String tenant = createStore(owner, "Sklep Terminowy", uniqueSlug("adv"));
        UUID tenantId = UUID.fromString(tenant);
        activate(owner, tenant, "STARTER", "MONTH");
        sql("update subscriptions set current_period_start = now() - interval '25 days', current_period_end = now() + interval '5 days' where tenant_id = ?", tenantId);
        lifecycle.runAt(Instant.now());
        JsonNode renewal = find(owner.get(base(tenant) + "/charges").json(), "RENEWAL");
        var pay = owner.post(base(tenant) + "/charges/" + renewal.get("id").asString() + "/pay", Map.of());
        assertThat(pay.status()).as(pay.body()).isEqualTo(200);
        assertThat(notify(renewal.get("id").asString(), "pay-adv", renewal.get("totalMinor").asLong(), "PAID", SECRET).getStatus()).isEqualTo(200);
        assertThat(owner.get(base(tenant)).json().get("status").asString()).isEqualTo("ACTIVE");

        // Period ends: the paid renewal becomes the new period
        Timestamp end = Timestamp.from(Instant.now().minusSeconds(60).truncatedTo(ChronoUnit.MILLIS));
        sql("update subscriptions set current_period_end = ? where tenant_id = ?", end, tenantId);
        sql("update subscription_charges set period_start = ? where id = ?", end, UUID.fromString(renewal.get("id").asString()));
        lifecycle.runAt(Instant.now());
        JsonNode sub = owner.get(base(tenant)).json();
        assertThat(sub.get("status").asString()).isEqualTo("ACTIVE");
        assertThat(Instant.parse(sub.get("currentPeriodStart").asString())).isEqualTo(end.toInstant());
        assertThat(owner.get(base(tenant) + "/history").body()).contains("RENEWED");
    }

    @Test
    void upgradeIsProratedAndDowngradeIsScheduled() throws Exception {
        ApiClient owner = registeredUser(uniqueEmail("upgrade"));
        String tenant = createStore(owner, "Sklep Rosnący", uniqueSlug("upg"));
        activate(owner, tenant, "STARTER", "MONTH");

        var change = owner.post(base(tenant) + "/change", Map.of("planCode", "BUSINESS", "interval", "MONTH"));
        assertThat(change.status()).as(change.body()).isEqualTo(200);
        assertThat(change.json().get("scheduled").asBoolean()).isFalse();
        JsonNode charge = change.json().get("payment").get("charge");
        assertThat(charge.get("kind").asString()).isEqualTo("UPGRADE");
        // The whole paid Starter period is still unused (it starts after the trial) → fully credited
        assertThat(charge.get("listAmountMinor").asLong()).isEqualTo(19900);
        assertThat(charge.get("discountMinor").asLong()).isEqualTo(7900);
        assertThat(charge.get("amountMinor").asLong()).isEqualTo(12000);
        assertThat(notify(charge.get("id").asString(), "pay-upg", charge.get("totalMinor").asLong(), "PAID", SECRET).getStatus()).isEqualTo(200);
        assertThat(owner.get(base(tenant)).json().get("plan").get("code").asString()).isEqualTo("BUSINESS");

        var downgrade = owner.post(base(tenant) + "/change", Map.of("planCode", "STARTER", "interval", "MONTH"));
        assertThat(downgrade.json().get("scheduled").asBoolean()).isTrue();
        JsonNode sub = owner.get(base(tenant)).json();
        assertThat(sub.get("plan").get("code").asString()).isEqualTo("BUSINESS");
        assertThat(sub.get("pendingPlan").get("code").asString()).isEqualTo("STARTER");

        // Cancel at period end and resume
        assertThat(owner.post(base(tenant) + "/cancel", Map.of()).status()).isEqualTo(204);
        assertThat(owner.get(base(tenant)).json().get("cancelAtPeriodEnd").asBoolean()).isTrue();
        assertThat(owner.post(base(tenant) + "/resume", Map.of()).status()).isEqualTo(204);
        assertThat(owner.get(base(tenant)).json().get("cancelAtPeriodEnd").asBoolean()).isFalse();
    }

    @Test
    void couponsDiscountChargesAndFullDiscountNeedsNoPayment() {
        String half = "HALF" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String free = "FREE" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        assertThat(admin.post("/api/v1/admin/coupons", Map.of("code", half, "percentOff", 50, "duration", "ONCE")).status()).isEqualTo(201);
        assertThat(admin.post("/api/v1/admin/coupons", Map.of("code", free, "percentOff", 100, "duration", "ONCE")).status()).isEqualTo(201);

        ApiClient owner = registeredUser(uniqueEmail("coupon"));
        String tenant = createStore(owner, "Sklep Rabatowy", uniqueSlug("cpn"));
        var checkout = owner.post(base(tenant) + "/checkout", Map.of("planCode", "STARTER", "interval", "MONTH", "couponCode", half.toLowerCase()));
        assertThat(checkout.status()).as(checkout.body()).isEqualTo(200);
        JsonNode charge = checkout.json().get("charge");
        assertThat(charge.get("discountMinor").asLong()).isEqualTo(3950);
        assertThat(charge.get("totalMinor").asLong()).isEqualTo(3950 + 909);
        assertThat(owner.post(base(tenant) + "/checkout", Map.of("planCode", "STARTER", "interval", "MONTH", "couponCode", "NIEMA")).code())
                .isEqualTo("COUPON_INVALID");

        ApiClient other = registeredUser(uniqueEmail("coupon-free"));
        String freeTenant = createStore(other, "Sklep Darmowy", uniqueSlug("free"));
        var freeCheckout = other.post(base(freeTenant) + "/checkout", Map.of("planCode", "STARTER", "interval", "MONTH", "couponCode", free));
        assertThat(freeCheckout.status()).as(freeCheckout.body()).isEqualTo(200);
        assertThat(freeCheckout.json().get("paymentUrl").isNull()).isTrue();
        assertThat(other.get(base(freeTenant)).json().get("status").asString()).isEqualTo("ACTIVE");
        // One redemption per store
        String again = createStore(other, "Sklep Drugi", uniqueSlug("free2"));
        assertThat(other.post(base(again) + "/checkout", Map.of("planCode", "STARTER", "interval", "MONTH", "couponCode", free)).status())
                .isEqualTo(200); // another store of the same owner may use it once as well
    }

    @Test
    void teamSizeIsLimitedByPlanAndAdminOverride() {
        ApiClient owner = registeredUser(uniqueEmail("limits"));
        String tenant = createStore(owner, "Sklep z Limitem", uniqueSlug("lim"));
        var override = admin.put("/api/v1/admin/subscriptions/" + tenant + "/overrides/staff.max",
                Map.of("value", "2", "reason", "Test limitu zespołu"));
        assertThat(override.status()).as(override.body()).isEqualTo(204);

        assertThat(owner.post("/api/v1/tenants/" + tenant + "/invitations", Map.of("email", uniqueEmail("m1"), "role", "MANAGER")).status())
                .isEqualTo(201);
        var refused = owner.post("/api/v1/tenants/" + tenant + "/invitations", Map.of("email", uniqueEmail("m2"), "role", "MANAGER"));
        assertThat(refused.status()).isEqualTo(402);
        assertThat(refused.code()).isEqualTo("ENTITLEMENT_LIMIT");
        assertThat(refused.json().get("entitlement").asString()).isEqualTo("staff.max");

        JsonNode staff = null;
        for (JsonNode e : owner.get(base(tenant)).json().get("entitlements")) {
            if (e.get("key").asString().equals("staff.max")) staff = e;
        }
        assertThat(staff.get("value").asString()).isEqualTo("2");
        assertThat(staff.get("overridden").asBoolean()).isTrue();

        assertThat(admin.delete("/api/v1/admin/subscriptions/" + tenant + "/overrides/staff.max").status()).isEqualTo(204);
        assertThat(owner.post("/api/v1/tenants/" + tenant + "/invitations", Map.of("email", uniqueEmail("m3"), "role", "MANAGER")).status())
                .isEqualTo(201);
    }

    @Test
    void adminEditsPlansWithGrandfatheredPricesAndSeesStats() throws Exception {
        String code = "T" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        Map<String, String> entitlements = new HashMap<>();
        for (EntitlementKey k : EntitlementKey.values()) {
            entitlements.put(k.key(), k.kind() == EntitlementKey.Kind.FEATURE ? "false" : "10");
        }
        var created = admin.post("/api/v1/admin/plans", Map.of("code", code, "name", "Testowy", "sortOrder", 99, "active", true,
                "publicPlan", true, "trialDays", 7, "entitlements", entitlements, "prices", Map.of("MONTH", 5000), "version", 0));
        assertThat(created.status()).as(created.body()).isEqualTo(201);
        String planId = created.json().get("id").asString();

        ApiClient owner = registeredUser(uniqueEmail("grandfather"));
        String tenant = createStore(owner, "Sklep Stała Cena", uniqueSlug("gf"));
        activate(owner, tenant, code, "MONTH");

        var plan = admin.get("/api/v1/admin/plans").json().get("plans");
        long version = -1;
        for (JsonNode p : plan) if (p.get("id").asString().equals(planId)) version = p.get("version").asLong();
        var updated = admin.put("/api/v1/admin/plans/" + planId, Map.of("name", "Testowy", "sortOrder", 99, "active", false,
                "publicPlan", true, "trialDays", 7, "entitlements", entitlements, "prices", Map.of("MONTH", 6000), "version", version));
        assertThat(updated.status()).as(updated.body()).isEqualTo(200);
        assertThat(updated.json().get("prices").get(0).get("amountMinor").asLong()).isEqualTo(6000);
        // Existing subscriber keeps the price they bought
        assertThat(owner.get(base(tenant)).json().get("price").get("amountMinor").asLong()).isEqualTo(5000);
        // Stale version is rejected
        assertThat(admin.put("/api/v1/admin/plans/" + planId, Map.of("name", "X", "sortOrder", 1, "active", false, "publicPlan", true,
                "trialDays", 7, "entitlements", entitlements, "prices", Map.of(), "version", version)).status()).isEqualTo(409);
        // Inactive plans are not offered
        assertThat(client().get("/api/v1/plans").body()).doesNotContain(code);

        JsonNode stats = admin.get("/api/v1/admin/billing/stats").json();
        assertThat(stats.get("mrrMinor").asLong()).isGreaterThanOrEqualTo(5000);
        assertThat(stats.get("arrMinor").asLong()).isEqualTo(stats.get("mrrMinor").asLong() * 12);
        assertThat(admin.get("/api/v1/admin/subscriptions?status=ACTIVE").body()).contains(tenant);
        var detail = admin.get("/api/v1/admin/subscriptions/" + tenant);
        assertThat(detail.status()).as(detail.body()).isEqualTo(200);
        assertThat(detail.json().get("charges").size()).isEqualTo(1);

        // Merchants have no access to billing administration
        assertThat(owner.get("/api/v1/admin/billing/stats").status()).isEqualTo(403);
        assertThat(owner.put("/api/v1/admin/payment-providers/fake", Map.of("enabled", false, "sandbox", true)).status()).isEqualTo(403);
    }

    @Test
    void usageIsMeteredAndFairUseNeverBlocksTheStore() throws Exception {
        String email = uniqueEmail("usage");
        ApiClient owner = registeredUser(email);
        String slug = uniqueSlug("use");
        String tenant = createStore(owner, "Sklep Popularny", slug);
        UUID tenantId = UUID.fromString(tenant);
        for (int i = 0; i < 3; i++) {
            assertThat(storefront(slug + ".shopivo.test").getStatus()).isEqualTo(200);
        }
        usageRecorder.record(tenantId, "storefront.requests", 7);
        usageJobs.flush();

        JsonNode usage = null;
        for (JsonNode u : owner.get(base(tenant)).json().get("usage")) {
            if (u.get("metric").asString().equals("storefront.requests")) usage = u;
        }
        assertThat(usage.get("value").asLong()).isEqualTo(10);
        assertThat(usage.get("fairUse").asBoolean()).isTrue();

        admin.put("/api/v1/admin/subscriptions/" + tenant + "/overrides/storefront.requests.monthly.fair_use",
                Map.of("value", "5", "reason", "Test fair use"));
        usageJobs.checkFairUse();
        usageJobs.checkFairUse(); // flagged once per month
        assertThat(owner.get(base(tenant) + "/history").body()).contains("FAIR_USE_EXCEEDED");
        assertThat(emails.awaitEmail(email, "limit uczciwego użytkowania").textBody()).contains("działają bez ograniczeń");
        assertThat(emails.count(email, "limit uczciwego użytkowania")).isEqualTo(1);
        // Soft limit: the storefront keeps serving customers
        assertThat(storefront(slug + ".shopivo.test").getStatus()).isEqualTo(200);

        JsonNode report = admin.get("/api/v1/admin/billing/usage").json();
        JsonNode row = null;
        for (JsonNode r : report.get("rows")) if (r.get("tenantId").asString().equals(tenant)) row = r;
        assertThat(row.get("fairUseExceeded").toString()).contains("storefront.requests");
        assertThat(row.get("revenueMonthlyNetMinor").asLong()).isZero(); // trial
        assertThat(row.get("marginMinor").asLong()).isNegative();
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private static String base(String tenant) {
        return "/api/v1/tenants/" + tenant + "/subscription";
    }

    private void activate(ApiClient owner, String tenant, String plan, String interval) throws Exception {
        var checkout = owner.post(base(tenant) + "/checkout", Map.of("planCode", plan, "interval", interval));
        assertThat(checkout.status()).as(checkout.body()).isEqualTo(200);
        JsonNode charge = checkout.json().get("charge");
        assertThat(notify(charge.get("id").asString(), "pay-" + UUID.randomUUID(), charge.get("totalMinor").asLong(), "PAID", SECRET)
                .getStatus()).isEqualTo(200);
        assertThat(owner.get(base(tenant)).json().get("status").asString()).isEqualTo("ACTIVE");
    }

    private MockHttpServletResponse notify(String chargeId, String paymentId, long amount, String status, String secret) throws Exception {
        String body = jsonMapper.writeValueAsString(Map.of("externalId", chargeId + "_abc", "paymentId", paymentId, "status", status,
                "amount", amount, "currency", "PLN"));
        return mvc.perform(post("/api/v1/webhooks/billing/fake").contentType(MediaType.APPLICATION_JSON).content(body)
                .header("X-Fake-Signature", FakeGatewayAccess.sign(body, secret))).andReturn().getResponse();
    }

    private MockHttpServletResponse storefront(String host) throws Exception {
        return mvc.perform(get("/api/v1/storefront/store").header("Host", host)).andReturn().getResponse();
    }

    private void sql(String statement, Object... args) {
        TenantContext.runAsSystem(() -> jdbc.update(statement, args));
    }

    private static JsonNode find(JsonNode charges, String kind) {
        for (JsonNode c : charges) if (c.get("kind").asString().equals(kind)) return c;
        throw new AssertionError("No " + kind + " charge in " + charges);
    }
}

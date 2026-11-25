package pl.shopivo.subscriptions.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.subscriptions.BillingInterval;
import pl.shopivo.subscriptions.SubscriptionService;
import pl.shopivo.subscriptions.SubscriptionViews.ChargeView;
import pl.shopivo.subscriptions.SubscriptionViews.HistoryView;
import pl.shopivo.subscriptions.SubscriptionViews.PaymentStart;
import pl.shopivo.subscriptions.SubscriptionViews.SubscriptionView;

/**
 * Subscription of a store. The tenant comes from the verified path membership ({@code TenantAccessFilter}); this
 * path stays writable when the store is read-only, so an expired store can always pay.
 */
@RestController
@RequestMapping("/api/v1/tenants/{tenantId}/subscription")
@Tag(name = "Subscription")
class TenantSubscriptionController {

    private final SubscriptionService subscriptions;
    private final RateLimiter rateLimiter;

    TenantSubscriptionController(SubscriptionService subscriptions, RateLimiter rateLimiter) {
        this.subscriptions = subscriptions;
        this.rateLimiter = rateLimiter;
    }

    record CheckoutRequest(@NotBlank @Size(max = 40) String planCode, @NotNull BillingInterval interval,
            @Size(max = 40) String couponCode) {
    }

    record ChangeRequest(@NotBlank @Size(max = 40) String planCode, @NotNull BillingInterval interval) {
    }

    @GetMapping
    @PreAuthorize("@tenantAccess.can('STORE_READ')")
    SubscriptionView get(@PathVariable UUID tenantId) {
        return subscriptions.details();
    }

    @PostMapping("/checkout")
    @PreAuthorize("@tenantAccess.can('BILLING_MANAGE')")
    PaymentStart checkout(@PathVariable UUID tenantId, @Valid @RequestBody CheckoutRequest request) {
        limit();
        return subscriptions.checkout(request.planCode(), request.interval(), request.couponCode());
    }

    @PostMapping("/change")
    @PreAuthorize("@tenantAccess.can('BILLING_MANAGE')")
    SubscriptionService.ChangeResult change(@PathVariable UUID tenantId, @Valid @RequestBody ChangeRequest request) {
        limit();
        return subscriptions.change(request.planCode(), request.interval());
    }

    @PostMapping("/cancel")
    @PreAuthorize("@tenantAccess.can('BILLING_MANAGE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable UUID tenantId) {
        subscriptions.cancel();
    }

    @PostMapping("/resume")
    @PreAuthorize("@tenantAccess.can('BILLING_MANAGE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void resume(@PathVariable UUID tenantId) {
        subscriptions.resume();
    }

    @GetMapping("/charges")
    @PreAuthorize("@tenantAccess.can('BILLING_MANAGE')")
    List<ChargeView> charges(@PathVariable UUID tenantId) {
        return subscriptions.charges();
    }

    @PostMapping("/charges/{chargeId}/pay")
    @PreAuthorize("@tenantAccess.can('BILLING_MANAGE')")
    PaymentStart pay(@PathVariable UUID tenantId, @PathVariable UUID chargeId) {
        limit();
        return subscriptions.pay(chargeId);
    }

    @GetMapping("/history")
    @PreAuthorize("@tenantAccess.can('BILLING_MANAGE')")
    List<HistoryView> history(@PathVariable UUID tenantId) {
        return subscriptions.history();
    }

    /** Each attempt calls the payment operator — keep it bounded per user. */
    private void limit() {
        rateLimiter.consume("billing-pay:" + SecurityUtils.requireUser().id(), 10, java.time.Duration.ofMinutes(10));
    }
}

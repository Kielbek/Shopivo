package pl.shopivo.orders.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.orders.Carts;
import pl.shopivo.orders.OrderModel.CartView;
import pl.shopivo.orders.OrderModel.OrderConfirmation;
import pl.shopivo.orders.OrderModel.PaymentMethod;
import pl.shopivo.orders.OrderModel.ShippingMethodView;
import pl.shopivo.orders.OrderPlacement;
import pl.shopivo.orders.Orders;
import pl.shopivo.orders.PaymentSettings;
import pl.shopivo.orders.ShippingMethods;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StorefrontTenants;

/**
 * Public cart and checkout API used by the storefront. The store comes from the Host header; the cart is addressed by
 * the secret token in {@code X-Cart-Token} (header, so it never appears in URLs or logs). No session/CSRF: the API holds
 * no ambient credentials.
 */
@RestController
@RequestMapping("/api/v1/storefront")
@Tag(name = "Storefront")
class StorefrontCheckoutController {

    private final StorefrontTenants storefront;
    private final Carts carts;
    private final OrderPlacement placement;
    private final Orders orders;
    private final ShippingMethods shipping;
    private final PaymentSettings payments;
    private final RateLimiter rateLimiter;
    private final TransactionTemplate tx;

    StorefrontCheckoutController(StorefrontTenants storefront, Carts carts, OrderPlacement placement, Orders orders,
            ShippingMethods shipping, PaymentSettings payments, RateLimiter rateLimiter, TransactionTemplate tx) {
        this.storefront = storefront;
        this.carts = carts;
        this.placement = placement;
        this.orders = orders;
        this.shipping = shipping;
        this.payments = payments;
        this.rateLimiter = rateLimiter;
        this.tx = tx;
    }

    record ItemRequest(@NotNull UUID variantId, @Min(1) @Max(999) int quantity) {
    }

    record QuantityRequest(@Min(0) @Max(999) int quantity) {
    }

    record PaymentOption(PaymentMethod method, String label, long feeMinor) {
    }

    record CheckoutOptions(List<ShippingMethodView> shippingMethods, List<PaymentOption> paymentMethods) {
    }

    record CheckoutResult(long number, String orderToken, long totalMinor, String currency) {
    }

    @PostMapping("/cart")
    @ResponseStatus(HttpStatus.CREATED)
    Carts.NewCart createCart(HttpServletRequest request) {
        UUID tenant = storefront.resolve(request);
        rateLimiter.consume("cart-create:" + request.getRemoteAddr(), 30, Duration.ofMinutes(1));
        return inTenant(tenant, carts::create);
    }

    @GetMapping("/cart")
    CartView cart(HttpServletRequest request, @RequestHeader("X-Cart-Token") String token) {
        return inTenant(storefront.resolve(request), () -> carts.view(token));
    }

    @PostMapping("/cart/items")
    CartView addItem(HttpServletRequest request, @RequestHeader("X-Cart-Token") String token, @Valid @RequestBody ItemRequest item) {
        return inTenant(storefront.resolve(request), () -> carts.add(token, item.variantId(), item.quantity()));
    }

    @PatchMapping("/cart/items/{variantId}")
    CartView updateItem(HttpServletRequest request, @RequestHeader("X-Cart-Token") String token, @PathVariable UUID variantId,
            @Valid @RequestBody QuantityRequest body) {
        return inTenant(storefront.resolve(request), () -> carts.update(token, variantId, body.quantity()));
    }

    @GetMapping("/checkout/options")
    CheckoutOptions options(HttpServletRequest request) {
        return inTenant(storefront.resolve(request), () -> {
            var settings = payments.current();
            List<PaymentOption> methods = new ArrayList<>();
            if (settings.bankTransferEnabled()) methods.add(new PaymentOption(PaymentMethod.BANK_TRANSFER, "Przelew tradycyjny", 0));
            if (settings.codEnabled()) methods.add(new PaymentOption(PaymentMethod.COD, "Za pobraniem", settings.codFeeMinor()));
            return new CheckoutOptions(shipping.list(true), methods);
        });
    }

    @PostMapping("/checkout")
    @ResponseStatus(HttpStatus.CREATED)
    CheckoutResult checkout(HttpServletRequest request, @RequestHeader("X-Cart-Token") String token,
            @RequestBody OrderPlacement.CustomerInput input) {
        UUID tenant = storefront.resolve(request);
        rateLimiter.consume("checkout:" + request.getRemoteAddr(), 10, Duration.ofMinutes(10));
        var placed = inTenant(tenant, () -> placement.checkout(token, input));
        return new CheckoutResult(placed.number(), placed.publicToken(), placed.totalMinor(), placed.currency());
    }

    @GetMapping("/orders/status")
    OrderConfirmation order(HttpServletRequest request, @RequestHeader("X-Order-Token") String token) {
        return inTenant(storefront.resolve(request), () -> orders.confirmation(token));
    }

    private <T> T inTenant(UUID tenant, java.util.function.Supplier<T> action) {
        return TenantContext.callInTenant(tenant, () -> tx.execute(s -> action.get()));
    }
}

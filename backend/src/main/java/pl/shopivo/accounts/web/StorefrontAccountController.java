package pl.shopivo.accounts.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.accounts.CustomerAccounts;
import pl.shopivo.orders.OrderModel.OrderView;
import pl.shopivo.reviews.Reviews;
import pl.shopivo.shared.config.ShopivoProperties;
import pl.shopivo.shared.error.ApiException;
import pl.shopivo.shared.ratelimit.RateLimiter;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.stores.StorefrontTenants;

/**
 * Customer account API of a storefront. The store comes from the host; the session is an HttpOnly cookie that is only
 * ever sent to this store's domain. Every request must carry {@code X-Requested-With: shopivo}: a custom header cannot
 * be sent cross-site without a CORS preflight (which this API never allows), which blocks CSRF.
 */
@RestController
@RequestMapping("/api/v1/storefront/account")
@Tag(name = "Storefront accounts")
class StorefrontAccountController {

    static final String COOKIE = "shopivo_customer";

    private final StorefrontTenants storefront;
    private final CustomerAccounts accounts;
    private final RateLimiter rateLimiter;
    private final pl.shopivo.shared.captcha.Captcha captcha;
    private final boolean secureCookie;

    StorefrontAccountController(StorefrontTenants storefront, CustomerAccounts accounts, RateLimiter rateLimiter, pl.shopivo.shared.captcha.Captcha captcha,
            ShopivoProperties properties) {
        this.storefront = storefront;
        this.accounts = accounts;
        this.rateLimiter = rateLimiter;
        this.captcha = captcha;
        this.secureCookie = properties.security() == null || properties.security().cookieSecure();
    }

    // ------------------------------------------------------------------------------------------------ public flows

    record RegisterRequest(String email, String password, String firstName, String lastName, boolean termsAccepted) {
    }

    @PostMapping("/register")
    ResponseEntity<Void> register(HttpServletRequest request, @RequestBody RegisterRequest body) {
        UUID tenant = guard(request);
        rateLimiter.consume("acc-register:" + request.getRemoteAddr(), 10, Duration.ofMinutes(10));
        captcha.verify(request.getHeader("X-Captcha-Token"), request.getRemoteAddr());
        if (body.email() != null) rateLimiter.consume("acc-register-email:" + tenant + ":" + body.email().strip().toLowerCase(Locale.ROOT), 3, Duration.ofHours(1));
        run(tenant, () -> {
            accounts.register(new CustomerAccounts.Registration(body.email(), body.password(), body.firstName(), body.lastName(), body.termsAccepted()));
            return null;
        });
        // Same answer whether or not the address already has an account.
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).build();
    }

    record VerifyRequest(String token, String password) {
    }

    @PostMapping("/verify")
    ResponseEntity<CustomerAccounts.Account> verify(HttpServletRequest request, HttpServletResponse response, @RequestBody VerifyRequest body) {
        UUID tenant = guard(request);
        rateLimiter.consume("acc-verify:" + request.getRemoteAddr(), 20, Duration.ofMinutes(10));
        String session = run(tenant, () -> accounts.verify(body.token(), body.password()));
        writeCookie(request, response, session);
        return noStore(run(tenant, () -> accounts.session(session).orElseThrow()));
    }

    record LoginRequest(String email, String password) {
    }

    @PostMapping("/login")
    ResponseEntity<CustomerAccounts.Account> login(HttpServletRequest request, HttpServletResponse response, @RequestBody LoginRequest body) {
        UUID tenant = guard(request);
        rateLimiter.consume("acc-login:" + request.getRemoteAddr(), 30, Duration.ofMinutes(10));
        String session = run(tenant, () -> accounts.login(body.email(), body.password()));
        writeCookie(request, response, session);
        return noStore(run(tenant, () -> accounts.session(session).orElseThrow()));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        UUID tenant = guard(request);
        String token = cookie(request);
        run(tenant, () -> {
            accounts.logout(token);
            return null;
        });
        clearCookie(request, response);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    record EmailRequest(String email) {
    }

    @PostMapping("/password-reset")
    ResponseEntity<Void> requestReset(HttpServletRequest request, @RequestBody EmailRequest body) {
        UUID tenant = guard(request);
        rateLimiter.consume("acc-reset:" + request.getRemoteAddr(), 5, Duration.ofMinutes(10));
        captcha.verify(request.getHeader("X-Captcha-Token"), request.getRemoteAddr());
        if (body.email() != null) rateLimiter.consume("acc-reset-email:" + tenant + ":" + body.email().strip().toLowerCase(Locale.ROOT), 3, Duration.ofHours(1));
        run(tenant, () -> {
            accounts.requestReset(body.email());
            return null;
        });
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).build();
    }

    record ResetRequest(String token, String password) {
    }

    @PostMapping("/password-reset/confirm")
    ResponseEntity<Void> confirmReset(HttpServletRequest request, HttpServletResponse response, @RequestBody ResetRequest body) {
        UUID tenant = guard(request);
        rateLimiter.consume("acc-reset-confirm:" + request.getRemoteAddr(), 20, Duration.ofMinutes(10));
        run(tenant, () -> {
            accounts.confirmReset(body.token(), body.password());
            return null;
        });
        clearCookie(request, response);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    // ------------------------------------------------------------------------------------------------ signed in

    /** The signed-in customer, or 204 for anonymous visitors (asked on every page view — not an error). */
    @GetMapping("/me")
    ResponseEntity<CustomerAccounts.Account> me(HttpServletRequest request) {
        UUID tenant = guard(request);
        String token = cookie(request);
        return run(tenant, () -> accounts.session(token)).map(StorefrontAccountController::noStore)
                .orElseGet(() -> ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build());
    }

    @PatchMapping("/me")
    ResponseEntity<CustomerAccounts.Account> updateMe(HttpServletRequest request, @RequestBody CustomerAccounts.ProfileInput body) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.updateProfile(id, body)));
    }

    record PasswordRequest(String currentPassword, String newPassword) {
    }

    @PostMapping("/password")
    ResponseEntity<Void> changePassword(HttpServletRequest request, @RequestBody PasswordRequest body) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        rateLimiter.consume("acc-password:" + id, 10, Duration.ofMinutes(10));
        run(tenant, () -> {
            accounts.changePassword(id, cookie(request), body.currentPassword(), body.newPassword());
            return null;
        });
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    record DeleteRequest(String password) {
    }

    @PostMapping("/delete")
    ResponseEntity<Void> delete(HttpServletRequest request, HttpServletResponse response, @RequestBody DeleteRequest body) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        rateLimiter.consume("acc-delete:" + id, 5, Duration.ofMinutes(10));
        run(tenant, () -> {
            accounts.delete(id, body.password());
            return null;
        });
        clearCookie(request, response);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/addresses")
    ResponseEntity<List<CustomerAccounts.Address>> addresses(HttpServletRequest request) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.addresses(id)));
    }

    @PostMapping("/addresses")
    ResponseEntity<List<CustomerAccounts.Address>> addAddress(HttpServletRequest request, @RequestBody CustomerAccounts.Address body) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.saveAddress(id, null, body)));
    }

    @PutMapping("/addresses/{addressId}")
    ResponseEntity<List<CustomerAccounts.Address>> updateAddress(HttpServletRequest request, @PathVariable UUID addressId,
            @RequestBody CustomerAccounts.Address body) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.saveAddress(id, addressId, body)));
    }

    @DeleteMapping("/addresses/{addressId}")
    ResponseEntity<List<CustomerAccounts.Address>> deleteAddress(HttpServletRequest request, @PathVariable UUID addressId) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.deleteAddress(id, addressId)));
    }

    /** What the customer sees about an order (no internal notes or events). */
    record CustomerOrder(long number, Instant createdAt, String status, String paymentStatus, String paymentMethod, long totalMinor,
            String currency, String shippingMethodName, String trackingNumber, Object shippingAddress, long subtotalMinor, long shippingMinor,
            long paymentFeeMinor, List<Line> items) {
        record Line(UUID productId, String name, String variantTitle, int quantity, long lineTotalMinor) {
        }

        static CustomerOrder of(OrderView o) {
            return new CustomerOrder(o.number(), o.createdAt(), o.status().name(), o.paymentStatus().name(), o.paymentMethod().name(),
                    o.totalMinor(), o.currency(), o.shippingMethodName(), o.trackingNumber(), o.shippingAddress(), o.subtotalMinor(),
                    o.shippingMinor(), o.paymentFeeMinor(), o.items().stream().map(i -> new Line(i.productId(), i.name(), i.variantTitle(),
                            i.quantity(), i.lineTotalMinor())).toList());
        }
    }

    @GetMapping("/orders")
    ResponseEntity<List<CustomerOrder>> orders(HttpServletRequest request) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.orders(id).stream().map(CustomerOrder::of).toList()));
    }

    @GetMapping("/orders/{number}")
    ResponseEntity<CustomerOrder> order(HttpServletRequest request, @PathVariable long number) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> CustomerOrder.of(accounts.order(id, number))));
    }

    /** Products the customer bought (completed, paid orders) and has not reviewed yet. */
    @GetMapping("/reviews/pending")
    ResponseEntity<List<Reviews.Reviewable>> reviewable(HttpServletRequest request) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.reviewable(id)));
    }

    record AccountReview(long orderNumber, UUID productId, Integer rating, String body, String authorName) {
    }

    @PostMapping("/reviews")
    ResponseEntity<Void> review(HttpServletRequest request, @RequestBody AccountReview body) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        rateLimiter.consume("acc-review:" + id, 30, Duration.ofMinutes(10));
        run(tenant, () -> {
            accounts.review(id, body.orderNumber(), new Reviews.ReviewInput(body.productId(), body.rating(), body.body(), body.authorName()));
            return null;
        });
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).build();
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private UUID guard(HttpServletRequest request) {
        if (!"shopivo".equals(request.getHeader("X-Requested-With"))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MISSING_HEADER", "Brak wymaganego nagłówka żądania.");
        }
        return storefront.resolvePublished(request);
    }

    private CustomerAccounts.Account signedIn(UUID tenant, HttpServletRequest request) {
        String token = cookie(request);
        return run(tenant, () -> accounts.session(token)).orElseThrow(() ->
                new ApiException(HttpStatus.UNAUTHORIZED, "NOT_SIGNED_IN", "Zaloguj się, aby kontynuować."));
    }

    private static String cookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) {
            if (COOKIE.equals(c.getName())) return c.getValue();
        }
        return null;
    }

    private void writeCookie(HttpServletRequest request, HttpServletResponse response, String token) {
        response.addHeader(HttpHeaders.SET_COOKIE, base(request, token).maxAge(CustomerAccountsTtl.SESSION).build().toString());
    }

    private void clearCookie(HttpServletRequest request, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, base(request, "").maxAge(0).build().toString());
    }

    /** Host-only (no Domain attribute): never shared with other stores on the platform domain. */
    private ResponseCookie.ResponseCookieBuilder base(HttpServletRequest request, String value) {
        return ResponseCookie.from(COOKIE, value).httpOnly(true).secure(secureCookie || request.isSecure()).sameSite("Lax").path("/");
    }

    /**
     * Service methods are transactional themselves; no outer transaction here, so e.g. a failed login still records the
     * failed attempt (an outer transaction would roll it back together with the error).
     */
    private <T> T run(UUID tenant, Supplier<T> action) {
        return TenantContext.callInTenant(tenant, action::get);
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(body);
    }

    static final class CustomerAccountsTtl {
        static final Duration SESSION = Duration.ofDays(30);
    }
}

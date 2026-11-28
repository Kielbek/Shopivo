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

    /** Holds the Google sign-in state between leaving for Google and coming back (HttpOnly, this store only, 10 minutes). */
    static final String OAUTH_COOKIE = "shopivo_oauth";

    private final StorefrontTenants storefront;
    private final CustomerAccounts accounts;
    private final pl.shopivo.accounts.GoogleSignIn google;
    private final RateLimiter rateLimiter;
    private final pl.shopivo.shared.captcha.Captcha captcha;
    private final List<pl.shopivo.orders.OnlinePayments> online;
    private final boolean secureCookie;

    StorefrontAccountController(StorefrontTenants storefront, CustomerAccounts accounts, RateLimiter rateLimiter, pl.shopivo.shared.captcha.Captcha captcha,
            ShopivoProperties properties, List<pl.shopivo.orders.OnlinePayments> online, pl.shopivo.accounts.GoogleSignIn google) {
        this.google = google;
        this.online = online;
        this.storefront = storefront;
        this.accounts = accounts;
        this.rateLimiter = rateLimiter;
        this.captcha = captcha;
        this.secureCookie = properties.security() == null || properties.security().cookieSecure();
    }

    // ------------------------------------------------------------------------------------------------ Google

    /**
     * The "Zaloguj się przez Google" button links here (a normal navigation, so no custom header): remembers a fresh state
     * in a cookie and sends the browser to Google. The callback address is this store's own domain.
     */
    @GetMapping("/google/start")
    ResponseEntity<Void> googleStart(HttpServletRequest request, HttpServletResponse response,
            @org.springframework.web.bind.annotation.RequestParam(name = "powrot", required = false) String returnPath) {
        UUID tenant = storefront.resolvePublished(request);
        rateLimiter.consume("acc-google:" + request.getRemoteAddr(), 30, Duration.ofMinutes(10));
        try {
            var start = run(tenant, () -> google.start(origin(request) + pl.shopivo.accounts.GoogleSignIn.CALLBACK_PATH, returnPath));
            response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(OAUTH_COOKIE, start.state()).httpOnly(true)
                    .secure(secureCookie || request.isSecure()).sameSite("Lax").path("/api/v1/storefront/account/google")
                    .maxAge(pl.shopivo.accounts.GoogleSignIn.STATE_TTL).build().toString());
            return redirect(start.authorizeUrl());
        } catch (pl.shopivo.shared.error.BusinessRuleException e) {
            return redirect("/konto/logowanie?blad=google");
        }
    }

    /** Google sends the browser back here; the state must match the one in this browser's cookie (no login CSRF). */
    @GetMapping("/google/callback")
    ResponseEntity<Void> googleCallback(HttpServletRequest request, HttpServletResponse response,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String state,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String code,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String error) {
        UUID tenant = storefront.resolvePublished(request);
        rateLimiter.consume("acc-google:" + request.getRemoteAddr(), 30, Duration.ofMinutes(10));
        String expected = cookie(request, OAUTH_COOKIE);
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(OAUTH_COOKIE, "").httpOnly(true).secure(secureCookie || request.isSecure())
                .sameSite("Lax").path("/api/v1/storefront/account/google").maxAge(0).build().toString());
        if (error != null) return redirect("/konto/logowanie?blad=" + ("access_denied".equals(error) ? "google-anulowano" : "google"));
        if (state == null || expected == null || !pl.shopivo.shared.crypto.Tokens.constantTimeEquals(state, expected)) {
            return redirect("/konto/logowanie?blad=google");
        }
        try {
            var result = run(tenant, () -> google.finish(state, code));
            writeCookie(request, response, result.session());
            return redirect(result.returnPath());
        } catch (pl.shopivo.shared.error.BusinessRuleException e) {
            return redirect("/konto/logowanie?blad=" + ("GOOGLE_ACCOUNT_MISMATCH".equals(e.code()) ? "google-inne-konto"
                    : "GOOGLE_EMAIL_NOT_VERIFIED".equals(e.code()) ? "google-email" : "google"));
        }
    }

    /**
     * Origin of the store as the visitor sees it. The storefront server passes it (with a dev port) in X-Shop-Origin; it is
     * used only when its host is the store's own host, otherwise https://host.
     */
    private static String origin(HttpServletRequest request) {
        String host = request.getServerName();
        String given = request.getHeader("X-Shop-Origin");
        if (given != null && given.matches("^https?://[a-z0-9.-]+(:\\d{2,5})?$")) {
            String h = given.replaceFirst("^https?://", "").replaceFirst(":\\d+$", "");
            if (h.equalsIgnoreCase(host)) return given;
        }
        return "https://" + host;
    }

    private static ResponseEntity<Void> redirect(String location) {
        return ResponseEntity.status(HttpStatus.FOUND).location(java.net.URI.create(location)).cacheControl(CacheControl.noStore()).build();
    }

    // ------------------------------------------------------------------------------------------------ public flows

    record RegisterRequest(String email, String password, String firstName, String lastName, boolean termsAccepted) {
    }

    @PostMapping("/register")
    ResponseEntity<Void> register(HttpServletRequest request, @RequestBody RegisterRequest body) {
        UUID tenant = guard(request);
        rateLimiter.consume("acc-register:" + request.getRemoteAddr(), 10, Duration.ofMinutes(10));
        captcha.verify(request.getHeader("X-Captcha-Token"), request.getRemoteAddr());
        if (body.email() != null) rateLimiter.consume("acc-register-email:" + tenant + ":" + emailHash(body.email()), 3, Duration.ofHours(1));
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
        // Per address (hashed): slows down guessing one customer's password from many IPs. Unknown addresses get the
        // same limit, so a 429 says nothing about whether an account exists.
        String emailKey = "acc-login-email:" + tenant + ":" + emailHash(body.email());
        rateLimiter.consume(emailKey, CustomerAccounts.MAX_LOGIN_ATTEMPTS, CustomerAccounts.LOGIN_WINDOW);
        String session = run(tenant, () -> accounts.login(body.email(), body.password()));
        rateLimiter.reset(emailKey);
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
        if (body.email() != null) rateLimiter.consume("acc-reset-email:" + tenant + ":" + emailHash(body.email()), 3, Duration.ofHours(1));
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
        record Line(UUID id, UUID productId, String name, String variantTitle, int quantity, long lineTotalMinor) {
        }

        static CustomerOrder of(OrderView o) {
            return new CustomerOrder(o.number(), o.createdAt(), o.status().name(), o.paymentStatus().name(), o.paymentMethod().name(),
                    o.totalMinor(), o.currency(), o.shippingMethodName(), o.trackingNumber(), o.shippingAddress(), o.subtotalMinor(),
                    o.shippingMinor(), o.paymentFeeMinor(), o.items().stream().map(i -> new Line(i.id(), i.productId(), i.name(), i.variantTitle(),
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

    record PaymentRedirect(String redirectUrl) {
    }

    /** Pays (or retries paying) one of the customer's own unpaid online orders. */
    @PostMapping("/orders/{number}/pay")
    ResponseEntity<PaymentRedirect> pay(HttpServletRequest request, @PathVariable long number) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        rateLimiter.consume("acc-pay:" + id, 20, Duration.ofMinutes(10));
        return noStore(run(tenant, () -> {
            OrderView order = accounts.order(id, number);
            if (order.paymentMethod() != pl.shopivo.orders.OrderModel.PaymentMethod.ONLINE
                    || order.paymentStatus() != pl.shopivo.orders.OrderModel.PaymentStatus.UNPAID
                    || order.status() == pl.shopivo.orders.OrderModel.OrderStatus.CANCELED) {
                throw new pl.shopivo.shared.error.BusinessRuleException("NOT_PAYABLE", "Tego zamówienia nie można teraz opłacić online.");
            }
            var provider = online.stream().filter(o -> o.activeOperatorName().isPresent()).findFirst()
                    .orElseThrow(() -> new pl.shopivo.shared.error.BusinessRuleException("PAYMENT_METHOD_UNAVAILABLE",
                            "Płatności online są chwilowo niedostępne."));
            return new PaymentRedirect(provider.start(order, request.getRemoteAddr()));
        }));
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

    // ------------------------------------------------------------------------------------------------ returns

    /** What the customer sees about a return (no internal data). */
    record CustomerReturn(long number, long orderNumber, String kind, String status, String reason, String merchantNote,
            long valueMinor, String currency, List<pl.shopivo.orders.Returns.Item> items, Instant createdAt, Instant decidedAt, Instant completedAt) {
        static CustomerReturn of(pl.shopivo.orders.Returns.ReturnView r) {
            return new CustomerReturn(r.number(), r.orderNumber(), r.kind().name(), r.status().name(), r.reason(), r.merchantNote(),
                    r.valueMinor(), r.currency(), r.items(), r.createdAt(), r.decidedAt(), r.completedAt());
        }
    }

    @GetMapping("/returns")
    ResponseEntity<List<CustomerReturn>> returns(HttpServletRequest request) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.returns(id).stream().map(CustomerReturn::of).toList()));
    }

    @GetMapping("/orders/{number}/return-options")
    ResponseEntity<CustomerAccounts.ReturnOptions> returnOptions(HttpServletRequest request, @PathVariable long number) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.returnOptions(id, number)));
    }

    @PostMapping("/orders/{number}/returns")
    ResponseEntity<CustomerReturn> requestReturn(HttpServletRequest request, @PathVariable long number,
            @RequestBody pl.shopivo.orders.Returns.ReturnInput body) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        rateLimiter.consume("acc-return:" + id, 10, Duration.ofHours(1));
        CustomerReturn created = run(tenant, () -> CustomerReturn.of(accounts.requestReturn(id, number, body)));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(created);
    }

    // ------------------------------------------------------------------------------------------------ favourites

    record WishlistRequest(List<UUID> productIds) {
    }

    @GetMapping("/wishlist")
    ResponseEntity<List<UUID>> wishlist(HttpServletRequest request) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.wishlist(id)));
    }

    /** Adds products (one heart click, or the favourites gathered before signing in). */
    @PostMapping("/wishlist")
    ResponseEntity<List<UUID>> addToWishlist(HttpServletRequest request, @RequestBody WishlistRequest body) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        rateLimiter.consume("acc-wish:" + id, 120, Duration.ofMinutes(10));
        return noStore(run(tenant, () -> accounts.addToWishlist(id, body == null ? List.of() : body.productIds())));
    }

    @DeleteMapping("/wishlist/{productId}")
    ResponseEntity<List<UUID>> removeFromWishlist(HttpServletRequest request, @PathVariable UUID productId) {
        UUID tenant = guard(request);
        UUID id = signedIn(tenant, request).id();
        return noStore(run(tenant, () -> accounts.removeFromWishlist(id, productId)));
    }

    // ------------------------------------------------------------------------------------------------ helpers

    /** Rate-limit keys never contain the e-mail address itself (no personal data in Redis). */
    private static String emailHash(String email) {
        return pl.shopivo.shared.crypto.Tokens.sha256(email == null ? "" : email.strip().toLowerCase(Locale.ROOT));
    }

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
        return cookie(request, COOKIE);
    }

    private static String cookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) {
            if (name.equals(c.getName())) return c.getValue();
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

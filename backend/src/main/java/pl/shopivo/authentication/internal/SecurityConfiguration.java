package pl.shopivo.authentication.internal;

import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.AndRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import pl.shopivo.shared.config.ShopivoProperties;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import pl.shopivo.tenants.TenantAccessFilter;
import pl.shopivo.tenants.TenantMemberships;
import pl.shopivo.tenants.TenantWriteAccessPolicy;
import pl.shopivo.users.UserAccounts;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class SecurityConfiguration {

    @Bean
    PasswordEncoder passwordEncoder() {
        // Argon2id (OWASP parameters) for new hashes; bcrypt accepted for imported/legacy hashes.
        Map<String, PasswordEncoder> encoders = Map.of(
                "argon2", new Argon2PasswordEncoder(16, 32, 1, 19_456, 2),
                "bcrypt", new BCryptPasswordEncoder(12));
        return new DelegatingPasswordEncoder("argon2", encoders);
    }

    /**
     * Double-submit CSRF token. The cookie uses the {@code __Host-} prefix (HTTPS), so a sibling subdomain — e.g. a
     * merchant storefront on {@code *.platform-domain} — cannot overwrite it ("cookie tossing"). The cookie is HttpOnly;
     * the SPA obtains the token from {@code GET /api/v1/auth/csrf} and sends it in the {@code X-XSRF-TOKEN} header.
     */
    static CookieCsrfTokenRepository csrfTokenRepository(boolean secure) {
        CookieCsrfTokenRepository repository = new CookieCsrfTokenRepository();
        repository.setCookieName(secure ? "__Host-XSRF-TOKEN" : "XSRF-TOKEN");
        repository.setHeaderName("X-XSRF-TOKEN");
        repository.setCookiePath("/");
        repository.setCookieCustomizer(c -> c.secure(secure).httpOnly(true).sameSite("Lax"));
        return repository;
    }

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, SessionService sessions, SessionCookies cookies,
            UserAccounts users, TenantMemberships memberships, JsonMapper jsonMapper, ProblemResponseWriter problems,
            ShopivoProperties properties, Environment environment, pl.shopivo.shared.ratelimit.RateLimiter rateLimiter, ObjectProvider<TenantWriteAccessPolicy> writePolicies,
            ObjectProvider<ClientRegistrationRepository> clientRegistrations,
            ObjectProvider<OAuthLoginSuccessHandler> oauthSuccessHandler) throws Exception {

        // Actuator endpoints are only served on the management port, which is never exposed publicly.
        RequestMatcher onManagementPort = request ->
                String.valueOf(request.getLocalPort()).equals(environment.getProperty("local.management.port"));

        http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokenRepository(properties.security().cookieSecure()))
                        .csrfTokenRequestHandler(new HeaderOnlyCsrfTokenRequestHandler())
                        // Webhooks are signed by operators; the storefront API holds no ambient credentials (cart token in a header).
                        .ignoringRequestMatchers("/api/v1/webhooks/**", "/api/v1/storefront/**"))
                .cors(cors -> cors.disable())
                .securityContext(c -> c.requireExplicitSave(true))
                // Sessions are our own opaque tokens (SessionAuthenticationFilter), not HttpSession. Spring Security's
                // session management would treat every request as a fresh login and replace the CSRF token
                // (CsrfAuthenticationStrategy). Token rotation on login/MFA/logout is done explicitly (CsrfTokenRotation).
                .sessionManagement(s -> s.disable())
                .httpBasic(b -> b.disable())
                .formLogin(f -> f.disable())
                .logout(l -> l.disable())
                .requestCache(c -> c.disable())
                .addFilterBefore(new SessionAuthenticationFilter(sessions, cookies, users,
                        properties.security().requirePlatformStaffMfa()), AnonymousAuthenticationFilter.class)
                .addFilterAfter(new UserRateLimitFilter(rateLimiter, problems), SessionAuthenticationFilter.class)
                .addFilterAfter(new TenantAccessFilter(memberships, jsonMapper, writePolicies.orderedStream().toList()),
                        AuthorizationFilter.class)
                .headers(h -> h
                        .contentSecurityPolicy(csp -> csp.policyDirectives(
                                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"))
                        .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .permissionsPolicyHeader(p -> p.policy("camera=(), microphone=(), geolocation=(), payment=()")))
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) ->
                                problems.write(res, HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Wymagane zalogowanie."))
                        .accessDeniedHandler((req, res, ex) -> {
                            if (ex instanceof CsrfException) {
                                problems.write(res, HttpStatus.FORBIDDEN, "CSRF_INVALID",
                                        "Sesja formularza wygasła. Odśwież stronę i spróbuj ponownie.");
                            } else {
                                problems.write(res, HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Brak uprawnień do wykonania tej operacji.");
                            }
                        }))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/auth/csrf", "/api/v1/auth/register", "/api/v1/auth/verify-email",
                                "/api/v1/auth/verify-email/resend", "/api/v1/auth/login", "/api/v1/auth/password/forgot",
                                "/api/v1/auth/password/reset", "/api/v1/auth/providers").permitAll()
                        .requestMatchers("/api/v1/auth/oauth2/**").permitAll()
                        .requestMatchers("/api/v1/auth/login/mfa").hasRole("MFA_PENDING")
                        .requestMatchers("/api/v1/auth/me", "/api/v1/auth/logout").authenticated()
                        .requestMatchers("/api/v1/storefront/**", "/api/v1/webhooks/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/media/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/plans").permitAll()
                        .requestMatchers("/api/docs/**", "/api/swagger-ui/**", "/api/swagger-ui.html").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasAnyRole("PLATFORM_ADMIN", "PLATFORM_SUPPORT")
                        .requestMatchers("/api/**").hasRole("USER")
                        .requestMatchers(new AndRequestMatcher(onManagementPort,
                                PathPatternRequestMatcher.withDefaults().matcher("/actuator/**"))).permitAll()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().denyAll());

        if (clientRegistrations.getIfAvailable() != null) {
            OAuthLoginSuccessHandler handler = oauthSuccessHandler.getObject();
            http.oauth2Login(o -> o
                    .authorizationEndpoint(a -> a.baseUri("/api/v1/auth/oauth2/authorization"))
                    .redirectionEndpoint(r -> r.baseUri("/api/v1/auth/oauth2/callback/*"))
                    .successHandler(handler)
                    .failureHandler(handler::onFailure));
        }
        return http.build();
    }
}

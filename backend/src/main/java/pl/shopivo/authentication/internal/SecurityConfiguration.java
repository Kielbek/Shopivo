package pl.shopivo.authentication.internal;

import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import pl.shopivo.tenants.TenantAccessFilter;
import pl.shopivo.tenants.TenantMemberships;
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

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, SessionService sessions, SessionCookies cookies,
            UserAccounts users, TenantMemberships memberships, JsonMapper jsonMapper, ProblemResponseWriter problems,
            ObjectProvider<ClientRegistrationRepository> clientRegistrations,
            ObjectProvider<OAuthLoginSuccessHandler> oauthSuccessHandler) throws Exception {

        http
                .csrf(csrf -> csrf.spa().ignoringRequestMatchers("/api/v1/webhooks/**"))
                .cors(cors -> cors.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(b -> b.disable())
                .formLogin(f -> f.disable())
                .logout(l -> l.disable())
                .requestCache(c -> c.disable())
                .addFilterBefore(new SessionAuthenticationFilter(sessions, cookies, users), AnonymousAuthenticationFilter.class)
                .addFilterAfter(new TenantAccessFilter(memberships, jsonMapper), AuthorizationFilter.class)
                .headers(h -> h
                        .contentSecurityPolicy(csp -> csp.policyDirectives(
                                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"))
                        .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .permissionsPolicyHeader(p -> p.policy("camera=(), microphone=(), geolocation=(), payment=()")))
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) ->
                                problems.write(res, HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Wymagane zalogowanie."))
                        .accessDeniedHandler((req, res, ex) ->
                                problems.write(res, HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Brak uprawnień do wykonania tej operacji.")))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/auth/csrf", "/api/v1/auth/register", "/api/v1/auth/verify-email",
                                "/api/v1/auth/verify-email/resend", "/api/v1/auth/login", "/api/v1/auth/password/forgot",
                                "/api/v1/auth/password/reset", "/api/v1/auth/providers").permitAll()
                        .requestMatchers("/api/v1/auth/oauth2/**").permitAll()
                        .requestMatchers("/api/v1/auth/login/mfa").hasRole("MFA_PENDING")
                        .requestMatchers("/api/v1/auth/me", "/api/v1/auth/logout").authenticated()
                        .requestMatchers("/api/v1/storefront/**", "/api/v1/webhooks/**").permitAll()
                        .requestMatchers("/api/docs/**", "/api/swagger-ui/**", "/api/swagger-ui.html").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasAnyRole("PLATFORM_ADMIN", "PLATFORM_SUPPORT")
                        .requestMatchers("/api/**").hasRole("USER")
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

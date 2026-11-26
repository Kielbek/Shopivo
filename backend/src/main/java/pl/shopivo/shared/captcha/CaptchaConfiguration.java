package pl.shopivo.shared.captcha;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(CaptchaProperties.class)
class CaptchaConfiguration {

    @Bean
    Captcha captcha(CaptchaProperties p, Environment environment) {
        String provider = p.provider() == null ? "none" : p.provider().toLowerCase(java.util.Locale.ROOT);
        if ("turnstile".equals(provider)) {
            if (blank(p.siteKey()) || blank(p.secretKey())) {
                throw new IllegalStateException("shopivo.captcha: site-key and secret-key are required for turnstile");
            }
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
            JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
            factory.setReadTimeout(Duration.ofSeconds(5));
            return new TurnstileCaptcha(RestClient.builder().requestFactory(factory).build(), p.siteKey(), p.secretKey(), p.verifyUrl());
        }
        if (environment.matchesProfiles("prod | production | staging")) {
            throw new IllegalStateException("shopivo.captcha.provider must be 'turnstile' in production (public forms need bot protection)");
        }
        return new Captcha() {
            @Override
            public String siteKey() {
                return null;
            }

            @Override
            public void verify(String token, String remoteIp) {
                // Disabled: local development and tests only (refused above in production profiles).
            }
        };
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}

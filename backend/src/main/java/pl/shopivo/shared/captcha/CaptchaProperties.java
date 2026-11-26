package pl.shopivo.shared.captcha;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code shopivo.captcha}: provider {@code turnstile} (Cloudflare) or {@code none} (refused in production profiles). */
@ConfigurationProperties(prefix = "shopivo.captcha")
public record CaptchaProperties(String provider, String siteKey, String secretKey, String verifyUrl) {
}

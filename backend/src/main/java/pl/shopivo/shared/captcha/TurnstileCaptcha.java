package pl.shopivo.shared.captcha;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import pl.shopivo.shared.error.ApiException;

/**
 * Cloudflare Turnstile server-side validation (siteverify). A rejected or missing token blocks the request. When
 * Cloudflare itself cannot be reached the request is let through and logged: failing closed would stop every checkout
 * during a provider outage, and the per-IP rate limits still apply.
 */
class TurnstileCaptcha implements Captcha {

    private static final Logger log = LoggerFactory.getLogger(TurnstileCaptcha.class);
    static final String DEFAULT_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private final RestClient http;
    private final String siteKey;
    private final String secretKey;
    private final String url;

    TurnstileCaptcha(RestClient http, String siteKey, String secretKey, String url) {
        this.http = http;
        this.siteKey = siteKey;
        this.secretKey = secretKey;
        this.url = url == null || url.isBlank() ? DEFAULT_URL : url;
    }

    @Override
    public String siteKey() {
        return siteKey;
    }

    @Override
    @SuppressWarnings("unchecked")
    public void verify(String token, String remoteIp) {
        if (token == null || token.isBlank() || token.length() > 2048) throw failed();
        var form = new LinkedMultiValueMap<String, String>();
        form.add("secret", secretKey);
        form.add("response", token);
        if (remoteIp != null) form.add("remoteip", remoteIp);
        Map<String, Object> result;
        try {
            result = http.post().uri(url).contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(Map.class);
        } catch (RestClientException e) {
            log.warn("Turnstile unavailable, request allowed: {}", e.getMessage());
            return;
        }
        if (result == null || !Boolean.TRUE.equals(result.get("success"))) {
            Object codes = result == null ? null : result.get("error-codes");
            // Misconfiguration (bad secret) is our problem, not the visitor's: let it through but make it loud.
            if (codes instanceof List<?> list && list.contains("invalid-input-secret")) {
                log.error("Turnstile secret key is invalid — CAPTCHA is not protecting forms");
                return;
            }
            throw failed();
        }
    }

    private static ApiException failed() {
        return new ApiException(HttpStatus.BAD_REQUEST, "CAPTCHA_FAILED", "Potwierdź, że nie jesteś robotem, i spróbuj ponownie.");
    }
}

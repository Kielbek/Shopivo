package pl.shopivo.shared.captcha;

/**
 * Proof that a public form was submitted by a person (checkout, customer registration, password reset). The storefront
 * renders the widget with {@link #siteKey()} and sends the resulting token in the {@code X-Captcha-Token} header.
 */
public interface Captcha {

    /** Site key for the widget, or null when verification is disabled (local development and tests only). */
    String siteKey();

    /** Throws 400 {@code CAPTCHA_FAILED} when the token is missing or rejected. */
    void verify(String token, String remoteIp);
}

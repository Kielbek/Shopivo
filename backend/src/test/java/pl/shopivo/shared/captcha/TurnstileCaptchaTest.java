package pl.shopivo.shared.captcha;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.client.RestClient;
import pl.shopivo.shared.error.ApiException;

class TurnstileCaptchaTest {

    @Test
    void acceptsOnlyTokensConfirmedByTheProvider() throws Exception {
        try (FakeTurnstile cf = new FakeTurnstile()) {
            Captcha captcha = new TurnstileCaptcha(RestClient.create(), "site", "secret", cf.url());
            assertThatCode(() -> captcha.verify("ok", "203.0.113.5")).doesNotThrowAnyException();
            assertThat(cf.lastRemoteIp.get()).isEqualTo("203.0.113.5");
            assertThatThrownBy(() -> captcha.verify("bot", null)).isInstanceOf(ApiException.class).hasMessageContaining("robotem");
            assertThatThrownBy(() -> captcha.verify(null, null)).isInstanceOf(ApiException.class);
            assertThatThrownBy(() -> captcha.verify("x".repeat(3000), null)).isInstanceOf(ApiException.class);
            // Our own misconfiguration does not lock customers out (it is logged as an error instead)
            cf.forcedBody = "{\"success\":false,\"error-codes\":[\"invalid-input-secret\"]}";
            assertThatCode(() -> captcha.verify("any", null)).doesNotThrowAnyException();
        }
    }

    @Test
    void providerOutageDoesNotBlockCheckout() {
        Captcha captcha = new TurnstileCaptcha(RestClient.create(), "site", "secret", "http://127.0.0.1:9/siteverify");
        assertThatCode(() -> captcha.verify("token", null)).doesNotThrowAnyException();
    }

    @Test
    void productionRefusesToRunWithoutCaptcha() {
        var config = new CaptchaConfiguration();
        var prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThatThrownBy(() -> config.captcha(new CaptchaProperties("none", null, null, null), prod)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> config.captcha(new CaptchaProperties("turnstile", "", "", null), new MockEnvironment()))
                .isInstanceOf(IllegalStateException.class);
        assertThat(config.captcha(new CaptchaProperties("none", null, null, null), new MockEnvironment()).siteKey()).isNull();
    }
}

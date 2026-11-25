package pl.shopivo.payments.internal;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * HTTP client for payment operators: short timeouts (a slow operator must not hold request threads) and no automatic
 * redirects (PayU answers order creation with 302 + JSON body that we read ourselves).
 */
@Configuration(proxyBeanMethods = false)
class OperatorHttpConfiguration {

    static final String BEAN = "paymentOperatorsHttp";

    @Bean(BEAN)
    RestClient.Builder paymentOperatorsHttp() {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(20));
        return RestClient.builder().requestFactory(factory)
                .defaultHeader("User-Agent", "Shopivo-Billing/1.0");
    }
}

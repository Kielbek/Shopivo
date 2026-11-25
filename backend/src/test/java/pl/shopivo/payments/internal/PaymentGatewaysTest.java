package pl.shopivo.payments.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pl.shopivo.payments.InvalidNotificationException;
import pl.shopivo.payments.PaymentGatewayModels.GatewayContext;
import pl.shopivo.payments.PaymentGatewayModels.InboundNotification;
import pl.shopivo.payments.PaymentGatewayModels.PaymentRequest;
import pl.shopivo.payments.PaymentGatewayModels.PaymentStatus;
import tools.jackson.databind.json.JsonMapper;

/**
 * Operator adapters against a mocked HTTP server. Request shapes and signature algorithms follow the operators'
 * public documentation; they are not a substitute for a run against each operator's sandbox.
 */
class PaymentGatewaysTest {

    private final JsonMapper json = JsonMapper.builder().build();
    private RestClient.Builder builder;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
    }

    private static PaymentRequest request() {
        return new PaymentRequest("charge-1_x", 9717, "PLN", "Subskrypcja Shopivo", "jan@example.com", "Jan Kowalski",
                "203.0.113.7", "https://app.shopivo.test/powrot", "https://api.shopivo.test/api/v1/webhooks/billing/x");
    }

    private static String sha(String algorithm, String input) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance(algorithm).digest(input.getBytes(StandardCharsets.UTF_8)));
    }

    private static InboundNotification inbound(String body, Map<String, String> headers) {
        return new InboundNotification(body, headers, "application/json");
    }

    @Nested
    class Przelewy24 {

        final GatewayContext ctx = new GatewayContext(Map.of("merchantId", "11111", "apiKey", "api-key", "crc", "crc-key"), true);
        Przelewy24Gateway gateway;

        @BeforeEach
        void create() {
            gateway = new Przelewy24Gateway(builder, json);
        }

        @Test
        void signsRegistrationWithSha384OfDocumentedJson() throws Exception {
            String expected = sha("SHA-384", "{\"sessionId\":\"charge-1_x\",\"merchantId\":11111,\"amount\":9717,\"currency\":\"PLN\",\"crc\":\"crc-key\"}");
            assertThat(Przelewy24Gateway.registerSign("charge-1_x", 11111, 9717, "PLN", "crc-key")).isEqualTo(expected);
        }

        @Test
        void registersTransactionAndReturnsSandboxRedirect() throws Exception {
            String auth = "Basic " + Base64.getEncoder().encodeToString("11111:api-key".getBytes(StandardCharsets.UTF_8));
            server.expect(requestTo("https://sandbox.przelewy24.pl/api/v1/transaction/register"))
                    .andExpect(method(HttpMethod.POST))
                    .andExpect(header("Authorization", auth))
                    .andExpect(jsonPath("$.sessionId").value("charge-1_x"))
                    .andExpect(jsonPath("$.amount").value(9717))
                    .andExpect(jsonPath("$.posId").value(11111))
                    .andExpect(jsonPath("$.sign").value(Przelewy24Gateway.registerSign("charge-1_x", 11111, 9717, "PLN", "crc-key")))
                    .andRespond(withSuccess("{\"data\":{\"token\":\"TOKEN123\"},\"responseCode\":0}", MediaType.APPLICATION_JSON));

            var link = gateway.createPayment(ctx, request());
            assertThat(link.redirectUrl()).isEqualTo("https://sandbox.przelewy24.pl/trnRequest/TOKEN123");
            server.verify();
        }

        @Test
        void verifiesSignedNotificationAndConfirmsTransaction() {
            String sign = Przelewy24Gateway.notificationSign(11111, 11111, "charge-1_x", 9717, 9717, "PLN", 555, 25, "Opis", "crc-key");
            String body = "{\"merchantId\":11111,\"posId\":11111,\"sessionId\":\"charge-1_x\",\"amount\":9717,\"originAmount\":9717,"
                    + "\"currency\":\"PLN\",\"orderId\":555,\"methodId\":25,\"statement\":\"Opis\",\"sign\":\"" + sign + "\"}";
            server.expect(requestTo("https://sandbox.przelewy24.pl/api/v1/transaction/verify"))
                    .andExpect(method(HttpMethod.PUT))
                    .andExpect(jsonPath("$.orderId").value(555))
                    .andExpect(jsonPath("$.sign").value(Przelewy24Gateway.verifySign("charge-1_x", 555, 9717, "PLN", "crc-key")))
                    .andRespond(withSuccess("{\"data\":{\"status\":\"success\"}}", MediaType.APPLICATION_JSON));

            var n = gateway.handleNotification(ctx, inbound(body, Map.of()));
            assertThat(n.status()).isEqualTo(PaymentStatus.PAID);
            assertThat(n.amountMinor()).isEqualTo(9717);
            assertThat(n.externalId()).isEqualTo("charge-1_x");
            assertThat(n.eventKey()).isEqualTo("p24:555:PAID");
            server.verify();
        }

        @Test
        void rejectsTamperedNotificationWithoutCallingOperator() {
            String sign = Przelewy24Gateway.notificationSign(11111, 11111, "charge-1_x", 9717, 9717, "PLN", 555, 25, "Opis", "crc-key");
            String tampered = "{\"merchantId\":11111,\"posId\":11111,\"sessionId\":\"charge-1_x\",\"amount\":1,\"originAmount\":9717,"
                    + "\"currency\":\"PLN\",\"orderId\":555,\"methodId\":25,\"statement\":\"Opis\",\"sign\":\"" + sign + "\"}";
            assertThatThrownBy(() -> gateway.handleNotification(ctx, inbound(tampered, Map.of())))
                    .isInstanceOf(InvalidNotificationException.class);
            server.verify();
        }
    }

    @Nested
    class PayU {

        final GatewayContext ctx = new GatewayContext(Map.of("posId", "300746", "clientId", "300746",
                "clientSecret", "client-secret", "secondKey", "second-key"), true);
        PayUGateway gateway;

        @BeforeEach
        void create() {
            gateway = new PayUGateway(builder, json);
        }

        @Test
        void obtainsTokenOnceAndReadsRedirectFrom302() {
            server.expect(ExpectedCount.once(), requestTo("https://secure.snd.payu.com/pl/standard/user/oauth/authorize"))
                    .andExpect(content().string(org.hamcrest.Matchers.containsString("grant_type=client_credentials")))
                    .andRespond(withSuccess("{\"access_token\":\"tok\",\"expires_in\":43199}", MediaType.APPLICATION_JSON));
            server.expect(ExpectedCount.twice(), requestTo("https://secure.snd.payu.com/api/v2_1/orders"))
                    .andExpect(header("Authorization", "Bearer tok"))
                    .andExpect(jsonPath("$.totalAmount").value("9717"))
                    .andExpect(jsonPath("$.extOrderId").value("charge-1_x"))
                    .andRespond(withStatus(HttpStatus.FOUND).contentType(MediaType.APPLICATION_JSON)
                            .body("{\"status\":{\"statusCode\":\"SUCCESS\"},\"redirectUri\":\"https://merch-prod.snd.payu.com/pay/?orderId=ABC\",\"orderId\":\"ABC\"}"));

            assertThat(gateway.createPayment(ctx, request()).redirectUrl()).isEqualTo("https://merch-prod.snd.payu.com/pay/?orderId=ABC");
            assertThat(gateway.createPayment(ctx, request()).providerPaymentId()).isEqualTo("ABC");
            server.verify();
        }

        @Test
        void verifiesOpenPayuSignature() throws Exception {
            String body = "{\"order\":{\"orderId\":\"ABC\",\"extOrderId\":\"charge-1_x\",\"totalAmount\":\"9717\",\"currencyCode\":\"PLN\",\"status\":\"COMPLETED\"}}";
            String signature = sha("MD5", body + "second-key");
            var n = gateway.handleNotification(ctx, inbound(body,
                    Map.of("openpayu-signature", "sender=checkout;signature=" + signature + ";algorithm=MD5;content=DOCUMENT")));
            assertThat(n.status()).isEqualTo(PaymentStatus.PAID);
            assertThat(n.amountMinor()).isEqualTo(9717);
            assertThat(n.eventKey()).isEqualTo("payu:ABC:COMPLETED");

            assertThatThrownBy(() -> gateway.handleNotification(ctx, inbound(body.replace("9717", "1"),
                    Map.of("openpayu-signature", "signature=" + signature + ";algorithm=MD5"))))
                    .isInstanceOf(InvalidNotificationException.class);
            assertThatThrownBy(() -> gateway.handleNotification(ctx, inbound(body, Map.of())))
                    .isInstanceOf(InvalidNotificationException.class);
        }

        @Test
        void mapsCanceledToFailedAndOtherStatesToPending() throws Exception {
            for (var c : Map.of("CANCELED", PaymentStatus.FAILED, "PENDING", PaymentStatus.PENDING, "WAITING_FOR_CONFIRMATION",
                    PaymentStatus.PENDING).entrySet()) {
                String body = "{\"order\":{\"orderId\":\"ABC\",\"extOrderId\":\"e\",\"totalAmount\":\"1\",\"currencyCode\":\"PLN\",\"status\":\"" + c.getKey() + "\"}}";
                String sig = sha("SHA-256", body + "second-key");
                assertThat(gateway.handleNotification(ctx, inbound(body, Map.of("openpayu-signature", "signature=" + sig + ";algorithm=SHA-256")))
                        .status()).isEqualTo(c.getValue());
            }
        }
    }

    @Nested
    class Tpay {

        final GatewayContext ctx = new GatewayContext(Map.of("merchantId", "1010", "clientId", "cid", "clientSecret", "cs",
                "securityCode", "sec"), true);
        TpayGateway gateway;

        @BeforeEach
        void create() {
            gateway = new TpayGateway(builder);
        }

        @Test
        void createsTransactionWithDecimalAmountAndHiddenDescription() {
            server.expect(requestTo("https://openapi.sandbox.tpay.com/oauth/auth"))
                    .andRespond(withSuccess("{\"access_token\":\"t\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));
            server.expect(requestTo("https://openapi.sandbox.tpay.com/transactions"))
                    .andExpect(jsonPath("$.amount").value(97.17))
                    .andExpect(jsonPath("$.hiddenDescription").value("charge-1_x"))
                    .andExpect(jsonPath("$.callbacks.notification.url").value("https://api.shopivo.test/api/v1/webhooks/billing/x"))
                    .andRespond(withSuccess("{\"result\":\"success\",\"title\":\"TR-1\",\"transactionPaymentUrl\":\"https://secure.sandbox.tpay.com/?title=TR-1\"}",
                            MediaType.APPLICATION_JSON));
            var link = gateway.createPayment(ctx, request());
            assertThat(link.redirectUrl()).isEqualTo("https://secure.sandbox.tpay.com/?title=TR-1");
            assertThat(link.providerPaymentId()).isEqualTo("TR-1");
            server.verify();
        }

        @Test
        void verifiesMd5sumAndMerchant() throws Exception {
            String md5 = sha("MD5", "1010" + "TR-1" + "97.17" + "charge-1_x" + "sec");
            String body = "id=1010&tr_id=TR-1&tr_amount=97.17&tr_crc=charge-1_x&tr_status=TRUE&md5sum=" + md5;
            var n = gateway.handleNotification(ctx, new InboundNotification(body, Map.of(), "application/x-www-form-urlencoded"));
            assertThat(n.status()).isEqualTo(PaymentStatus.PAID);
            assertThat(n.amountMinor()).isEqualTo(9717);
            assertThat(n.externalId()).isEqualTo("charge-1_x");
            assertThat(gateway.acknowledgement().body()).isEqualTo("TRUE");

            assertThatThrownBy(() -> gateway.handleNotification(ctx, new InboundNotification(body.replace("97.17", "1.00"), Map.of(), null)))
                    .isInstanceOf(InvalidNotificationException.class);
            String otherMerchant = "id=2020&tr_id=TR-1&tr_amount=97.17&tr_crc=charge-1_x&tr_status=TRUE&md5sum="
                    + sha("MD5", "2020TR-197.17charge-1_xsec");
            assertThatThrownBy(() -> gateway.handleNotification(ctx, new InboundNotification(otherMerchant, Map.of(), null)))
                    .isInstanceOf(InvalidNotificationException.class);
        }
    }
}

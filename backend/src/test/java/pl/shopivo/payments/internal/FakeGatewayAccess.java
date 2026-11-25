package pl.shopivo.payments.internal;

/** Test access to the simulated operator's signature (the gateway class itself is package-private). */
public final class FakeGatewayAccess {

    private FakeGatewayAccess() {
    }

    public static String sign(String body, String secret) {
        return FakeGateway.sign(body, secret);
    }
}

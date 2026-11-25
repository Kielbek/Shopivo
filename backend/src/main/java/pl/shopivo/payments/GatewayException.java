package pl.shopivo.payments;

import org.springframework.http.HttpStatus;
import pl.shopivo.shared.error.ApiException;

/** Operator unreachable, misconfigured or rejected the request. Message is safe to show to administrators/merchants. */
public class GatewayException extends ApiException {

    public GatewayException(String message) {
        super(HttpStatus.BAD_GATEWAY, "PAYMENT_PROVIDER_ERROR", message);
    }
}

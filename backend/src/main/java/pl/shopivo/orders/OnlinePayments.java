package pl.shopivo.orders;

import java.util.Optional;
import pl.shopivo.orders.OrderModel.OrderView;

/**
 * SPI (implemented by the store payments module): online payment with the store's own operator account. Keeps orders
 * independent of operator adapters, credentials and notifications.
 */
public interface OnlinePayments {

    /** Display name of the operator when online payments are enabled for the current store. */
    Optional<String> activeOperatorName();

    /** Id of that operator (stripe, przelewy24, payu, tpay…): the storefront shows its logo. */
    default Optional<String> activeOperatorId() {
        return Optional.empty();
    }

    /** Registers a payment of the (unpaid) order with the operator and returns the page the customer is sent to. */
    String start(OrderView order, String customerIp);
}

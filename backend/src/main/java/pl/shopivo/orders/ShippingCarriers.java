package pl.shopivo.orders;

import java.util.Map;
import pl.shopivo.orders.OrderModel.PickupPoint;
import pl.shopivo.orders.OrderModel.ShippingType;

/** SPI (implemented by the shipping module): carrier integrations a shipping method can be linked to. */
public interface ShippingCarriers {

    /** Carriers with an enabled account in the current store: id → display name. */
    Map<String, String> enabled();

    /** Whether the carrier can deliver this kind of shipping method (e.g. parcel lockers). */
    boolean supports(String carrier, ShippingType type);

    /** Validates a pickup point chosen at checkout and returns its description (throws 422 when unknown). */
    PickupPoint pickupPoint(String carrier, String code);

    /** Public tracking page of a parcel, if the carrier has one. */
    java.util.Optional<String> trackingUrl(String carrier, String trackingNumber);
}

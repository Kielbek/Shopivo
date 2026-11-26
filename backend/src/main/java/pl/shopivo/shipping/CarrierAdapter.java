package pl.shopivo.shipping;

import java.util.List;
import java.util.Optional;
import pl.shopivo.shipping.CarrierModels.CarrierContext;
import pl.shopivo.shipping.CarrierModels.CarrierDescriptor;
import pl.shopivo.shipping.CarrierModels.CarrierShipment;
import pl.shopivo.shipping.CarrierModels.Point;
import pl.shopivo.shipping.CarrierModels.ShipmentRequest;

/** One carrier's API. Stateless: the merchant's credentials come with every call. */
public interface CarrierAdapter {

    CarrierDescriptor descriptor();

    default String id() {
        return descriptor().id();
    }

    void testConnection(CarrierContext ctx);

    CarrierShipment createShipment(CarrierContext ctx, ShipmentRequest request);

    /** Current state of a created shipment (the tracking number may appear later). */
    CarrierShipment shipment(CarrierContext ctx, String externalId);

    /** Label PDF (A6). */
    byte[] label(CarrierContext ctx, String externalId);

    /** Tracking status by tracking number. */
    CarrierShipment track(CarrierContext ctx, String trackingNumber);

    /** Parcel lockers near a postal code or in a city (public carrier data). */
    List<Point> searchPoints(boolean sandbox, String query);

    Optional<Point> point(boolean sandbox, String code);

    String trackingUrl(String trackingNumber);
}

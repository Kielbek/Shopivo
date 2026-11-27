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

    // ---------------------------------------------------------------- aggregators (Furgonetka, Apaczka)

    /** Services available on the account (aggregators); single carriers have none to choose from. */
    default List<CarrierModels.CarrierService> services(CarrierContext ctx) {
        return List.of();
    }

    /** Pickup points for a service — aggregators need the account (and the service's courier); others use public data. */
    default List<Point> searchPoints(CarrierContext ctx, CarrierModels.CarrierService service, String query) {
        return searchPoints(ctx.sandbox(), query);
    }

    default Optional<Point> point(CarrierContext ctx, CarrierModels.CarrierService service, String code) {
        return point(ctx.sandbox(), code);
    }

    /** Tracking by our stored ids; aggregators track by their own shipment id. */
    default CarrierShipment track(CarrierContext ctx, String externalId, String trackingNumber) {
        return track(ctx, trackingNumber);
    }

    // ---------------------------------------------------------------- OAuth carriers

    /** Sign-in page at the carrier (OAuth authorization code flow). */
    default String authorizationUrl(boolean sandbox, String redirectUri, String state) {
        throw new CarrierModels.CarrierException("Ten przewoźnik nie obsługuje logowania.");
    }

    /** Exchanges the authorization code for tokens. */
    default CarrierModels.OAuthTokens exchangeCode(boolean sandbox, String code, String redirectUri) {
        throw new CarrierModels.CarrierException("Ten przewoźnik nie obsługuje logowania.");
    }

    default CarrierModels.OAuthTokens refresh(boolean sandbox, String refreshToken) {
        throw new CarrierModels.CarrierException("Ten przewoźnik nie obsługuje logowania.");
    }
}

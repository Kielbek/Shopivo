package pl.shopivo.shipping;

import java.util.List;
import java.util.Map;
import pl.shopivo.orders.OrderModel.ShippingType;

/** Data types shared by carrier adapters. */
public final class CarrierModels {

    private CarrierModels() {
    }

    public record CredentialField(String key, String label, boolean secret, String hint) {
    }

    /**
     * @param aggregator the account gives access to many couriers (Furgonetka, Apaczka) — the store ticks the services it uses
     * @param oauth the account is connected by signing in at the carrier (no keys typed in)
     * @param available the platform has what the carrier needs (e.g. Shopivo's OAuth app for Furgonetka)
     */
    public record CarrierDescriptor(String id, String name, String description, List<CredentialField> credentials,
            List<ShippingType> services, String docsUrl, boolean aggregator, boolean oauth, boolean available) {

        public CarrierDescriptor(String id, String name, String description, List<CredentialField> credentials,
                List<ShippingType> services, String docsUrl) {
            this(id, name, description, credentials, services, docsUrl, false, false, true);
        }
    }

    /**
     * One courier service on an aggregator account (e.g. "DPD Classic" on Furgonetka).
     * @param courier carrier code for pickup points and logos (inpost, dpd, dhl, gls, ups, poczta, orlen, fedex…)
     * @param types delivery kinds the service can do: COURIER (to the door) and/or PARCEL_LOCKER (to a point/locker)
     */
    public record CarrierService(String id, String name, String courier, List<ShippingType> types) {
    }

    /** The store as the sender (company data from the store settings). */
    public record Sender(String name, String company, String email, String phone, String line1, String postalCode, String city,
            String countryCode) {
    }

    public record CarrierContext(Map<String, String> credentials, boolean sandbox) {
        public String require(String key) {
            String v = credentials.get(key);
            if (v == null || v.isBlank()) throw new CarrierException("Brak wymaganych danych konta przewoźnika: " + key);
            return v.strip();
        }
    }

    public record Recipient(String name, String company, String email, String phone, String line1, String postalCode, String city,
            String countryCode) {
    }

    /** Locker parcels use a size template (small/medium/large); courier parcels weight and dimensions. */
    public record ParcelSpec(String template, Integer weightGrams, Integer lengthMm, Integer widthMm, Integer heightMm) {
    }

    /** How the merchant hands the parcel over: dropped at a parcel locker, or collected by a courier. */
    public enum SendingMethod { PARCEL_LOCKER, COURIER_PICKUP }

    /** {@code service}: the aggregator service id (null for single-carrier adapters); {@code sender}: the store's address. */
    public record ShipmentRequest(ShippingType type, Recipient recipient, String pointCode, ParcelSpec parcel, String reference,
            Long codMinor, String currency, SendingMethod sendingMethod, String service, Sender sender) {

        public ShipmentRequest(ShippingType type, Recipient recipient, String pointCode, ParcelSpec parcel, String reference,
                Long codMinor, String currency, SendingMethod sendingMethod) {
            this(type, recipient, pointCode, parcel, reference, codMinor, currency, sendingMethod, null, null);
        }
    }

    public enum ShipmentStatus { PENDING, READY, IN_TRANSIT, READY_FOR_PICKUP, DELIVERED, RETURNED, FAILED, CANCELED }

    public record CarrierShipment(String externalId, String trackingNumber, String carrierStatus, ShipmentStatus status) {
    }

    public record Point(String code, String name, String address, String description) {
    }

    /** OAuth tokens of a carrier account (stored encrypted with the other credentials). */
    public record OAuthTokens(String accessToken, String refreshToken, java.time.Instant expiresAt) {
    }

    /** A carrier rejected or could not process a request; the message is shown to the merchant. */
    public static class CarrierException extends RuntimeException {
        public CarrierException(String message) {
            super(message);
        }
    }
}

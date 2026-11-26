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

    public record CarrierDescriptor(String id, String name, String description, List<CredentialField> credentials,
            List<ShippingType> services, String docsUrl) {
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

    public record ShipmentRequest(ShippingType type, Recipient recipient, String pointCode, ParcelSpec parcel, String reference,
            Long codMinor, String currency, SendingMethod sendingMethod) {
    }

    public enum ShipmentStatus { PENDING, READY, IN_TRANSIT, READY_FOR_PICKUP, DELIVERED, RETURNED, FAILED, CANCELED }

    public record CarrierShipment(String externalId, String trackingNumber, String carrierStatus, ShipmentStatus status) {
    }

    public record Point(String code, String name, String address, String description) {
    }

    /** A carrier rejected or could not process a request; the message is shown to the merchant. */
    public static class CarrierException extends RuntimeException {
        public CarrierException(String message) {
            super(message);
        }
    }
}

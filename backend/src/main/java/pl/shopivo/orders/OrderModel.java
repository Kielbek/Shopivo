package pl.shopivo.orders;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Enums and read models of the orders module. Amounts in minor units, gross. */
public final class OrderModel {

    private OrderModel() {
    }

    public enum OrderStatus { NEW, PROCESSING, SHIPPED, COMPLETED, CANCELED }

    public enum PaymentStatus { UNPAID, PAID, REFUNDED }

    public enum PaymentMethod { BANK_TRANSFER, COD, MANUAL }

    public enum ShippingType { COURIER, PARCEL_LOCKER, POST, PICKUP, DIGITAL }

    public enum Source { STOREFRONT, PANEL }

    public record Address(String name, String company, String line1, String line2, String postalCode, String city,
            String countryCode, String phone) {
    }

    /** Invoice data (company purchase). {@code address} null = same as shipping. */
    public record Billing(boolean invoice, String companyName, String taxId, Address address) {
    }

    public record ShippingMethodView(UUID id, String name, String description, ShippingType type, long priceMinor,
            Long freeFromMinor, boolean active, int position, long version) {
    }

    public record PaymentSettingsView(boolean bankTransferEnabled, String bankAccountHolder, String bankAccountNumber,
            String bankName, boolean codEnabled, long codFeeMinor, int unpaidCancelDays, long version) {
    }

    public record CartLine(UUID variantId, UUID productId, String name, String variantTitle, String sku, int quantity,
            long unitPriceMinor, Long compareAtMinor, long lineTotalMinor, boolean available, Integer availableQuantity) {
    }

    public record CartView(String currency, List<CartLine> lines, int itemCount, long subtotalMinor, boolean checkoutReady) {
    }

    public record OrderItemView(UUID id, UUID productId, UUID variantId, String name, String variantTitle, String sku,
            int quantity, long unitPriceMinor, int vatRateBps, long lineTotalMinor) {
    }

    public record OrderEventView(String type, String message, boolean internal, String actorName, Instant createdAt) {
    }

    public record OrderView(UUID id, long number, Source source, OrderStatus status, PaymentStatus paymentStatus,
            PaymentMethod paymentMethod, UUID customerId, String email, String phone, String firstName, String lastName,
            Address shippingAddress, Billing billing, String shippingMethodName, long shippingMinor, long paymentFeeMinor,
            long subtotalMinor, long discountMinor, long totalMinor, long taxMinor, String currency, String customerNote,
            String trackingNumber, List<OrderItemView> items, List<OrderEventView> events, Instant paidAt, Instant shippedAt,
            Instant completedAt, Instant canceledAt, String cancelReason, Instant termsAcceptedAt, UUID termsRevisionId,
            Instant createdAt, long version) {
    }

    public record OrderRow(UUID id, long number, OrderStatus status, PaymentStatus paymentStatus, PaymentMethod paymentMethod,
            String customerName, String email, int itemCount, long totalMinor, String currency, Instant createdAt) {
    }

    public record OrderStats(long newOrders, long processing, long unpaid, long ordersToday, long revenueTodayMinor,
            long revenue30dMinor, long orders30d, String currency) {
    }

    /** Public confirmation for the customer (no internal notes). */
    public record OrderConfirmation(long number, OrderStatus status, PaymentStatus paymentStatus, PaymentMethod paymentMethod,
            List<OrderItemView> items, long subtotalMinor, long shippingMinor, long paymentFeeMinor, long totalMinor,
            String currency, String shippingMethodName, PaymentSettingsView bankTransfer, Instant createdAt) {
    }
}

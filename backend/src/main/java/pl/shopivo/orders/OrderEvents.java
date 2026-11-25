package pl.shopivo.orders;

import java.util.UUID;

/** Published inside the transaction; e-mails are sent after commit. */
public final class OrderEvents {

    private OrderEvents() {
    }

    public record OrderPlaced(UUID tenantId, UUID orderId) {
    }

    public record OrderShipped(UUID tenantId, UUID orderId) {
    }

    public record OrderCanceled(UUID tenantId, UUID orderId, boolean notifyCustomer) {
    }
}

package pl.shopivo.shipping;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.orders.OrderModel.OrderStatus;
import pl.shopivo.orders.OrderModel.OrderView;
import pl.shopivo.orders.OrderModel.PaymentMethod;
import pl.shopivo.orders.OrderModel.PaymentStatus;
import pl.shopivo.orders.OrderModel.ShippingType;
import pl.shopivo.orders.Orders;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shipping.CarrierModels.CarrierException;
import pl.shopivo.shipping.CarrierModels.CarrierShipment;
import pl.shopivo.shipping.CarrierModels.ParcelSpec;
import pl.shopivo.shipping.CarrierModels.Recipient;
import pl.shopivo.shipping.CarrierModels.SendingMethod;
import pl.shopivo.shipping.CarrierModels.ShipmentRequest;
import pl.shopivo.shipping.CarrierModels.ShipmentStatus;
import tools.jackson.databind.json.JsonMapper;

/**
 * Shipments of orders with the store's carrier account. Carrier calls happen outside database transactions; the
 * shipment row records each step. A tracking job follows parcels and completes delivered orders.
 */
@Service
public class Shipments {

    private static final Logger log = LoggerFactory.getLogger(Shipments.class);

    private final CarrierAccounts accounts;
    private final Orders orders;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final JsonMapper json;
    private final AuditLog auditLog;

    Shipments(CarrierAccounts accounts, Orders orders, JdbcTemplate jdbc, TransactionTemplate tx, JsonMapper json, AuditLog auditLog) {
        this.accounts = accounts;
        this.orders = orders;
        this.jdbc = jdbc;
        this.tx = tx;
        this.json = json;
        this.auditLog = auditLog;
    }

    public record ShipmentView(UUID id, String carrierId, String service, String trackingNumber, String trackingUrl, ShipmentStatus status,
            String carrierStatus, boolean labelAvailable, String error, Instant createdAt, Instant deliveredAt, boolean sandbox) {
    }

    public record CreateInput(String template, Integer weightGrams, Integer lengthMm, Integer widthMm, Integer heightMm, SendingMethod sendingMethod) {
    }

    public List<ShipmentView> list(UUID orderId) {
        return tx.execute(s -> jdbc.query("select * from shipments where tenant_id = ? and order_id = ? order by created_at desc",
                (rs, i) -> view(rs), TenantContext.requireTenantId(), orderId));
    }

    public ShipmentView create(UUID orderId, CreateInput in, UUID actor) {
        UUID tenant = TenantContext.requireTenantId();
        OrderView order = tx.execute(s -> orders.get(orderId));
        if (order.status() == OrderStatus.CANCELED) throw new BusinessRuleException("ORDER_CANCELED", "Zamówienie jest anulowane.");
        if (order.shippingCarrier() == null) {
            throw new BusinessRuleException("NO_CARRIER", "Sposób dostawy tego zamówienia nie jest powiązany z przewoźnikiem.");
        }
        var active = tx.execute(s -> accounts.active(order.shippingCarrier()))
                .orElseThrow(() -> new BusinessRuleException("CARRIER_DISABLED", "Konto przewoźnika jest wyłączone (Wysyłka → Przewoźnicy)."));
        boolean locker = order.pickupPoint() != null;
        if (!locker && order.shippingAddress() == null) throw new BusinessRuleException("NO_ADDRESS", "Zamówienie nie ma adresu dostawy.");
        ShippingType type = locker ? ShippingType.PARCEL_LOCKER : ShippingType.COURIER;
        Long cod = order.paymentMethod() == PaymentMethod.COD && order.paymentStatus() == PaymentStatus.UNPAID ? order.totalMinor() : null;
        ParcelSpec parcel = validate(type, new ParcelSpec(in.template() == null ? null : in.template().strip().toLowerCase(java.util.Locale.ROOT),
                in.weightGrams(), in.lengthMm(), in.widthMm(), in.heightMm()));
        UUID id = UuidV7.generate();
        tx.executeWithoutResult(s -> {
            // One live shipment per order; the advisory lock serialises concurrent clicks.
            jdbc.query("select pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { }, "shipment:" + orderId);
            Integer live = jdbc.queryForObject("select count(*) from shipments where tenant_id = ? and order_id = ? and status not in ('FAILED', 'CANCELED')",
                    Integer.class, tenant, orderId);
            if (live != null && live > 0) throw new ConflictException("SHIPMENT_EXISTS", "To zamówienie ma już przesyłkę.");
            jdbc.update("""
                    insert into shipments (id, tenant_id, order_id, carrier_id, service, status, parcel_json, sandbox) values (?, ?, ?, ?, ?, 'PENDING', ?, ?)
                    """, id, tenant, orderId, active.adapter().id(), type.name(), json.writeValueAsString(parcel), active.sandbox());
        });
        var address = order.shippingAddress();
        String name = address != null && address.name() != null ? address.name() : (order.firstName() + " " + order.lastName()).strip();
        ShipmentRequest request = new ShipmentRequest(type, new Recipient(name, address == null ? null : address.company(), order.email(),
                order.phone() != null ? order.phone() : address == null ? null : address.phone(), address == null ? null : address.line1(),
                address == null ? null : address.postalCode(), address == null ? null : address.city(), address == null ? "PL" : address.countryCode()),
                locker ? order.pickupPoint().code() : null, parcel, "Zamówienie " + order.number(), cod, order.currency(),
                in.sendingMethod() == null ? SendingMethod.PARCEL_LOCKER : in.sendingMethod());
        CarrierShipment created;
        try {
            created = active.adapter().createShipment(active.context(), request);
        } catch (CarrierException e) {
            tx.executeWithoutResult(s -> jdbc.update("update shipments set status = 'FAILED', error = ?, updated_at = now() where id = ?",
                    truncate(e.getMessage(), 500), id));
            throw new BusinessRuleException("SHIPMENT_FAILED", e.getMessage());
        }
        apply(id, orderId, active.adapter().descriptor().name(), created, null);
        tx.executeWithoutResult(s -> auditLog.record(AuditEntry.tenant("shipping.shipment.created", tenant, "order", orderId)
                .with(Map.of("carrier", active.adapter().id()))));
        return get(id);
    }

    /** Asks the carrier for the current state (e.g. the tracking number appears once the label is ready). */
    public ShipmentView refresh(UUID shipmentId) {
        Row r = row(shipmentId);
        var active = tx.execute(s -> accounts.active(r.carrierId()))
                .orElseThrow(() -> new BusinessRuleException("CARRIER_DISABLED", "Konto przewoźnika jest wyłączone."));
        CarrierShipment state;
        try {
            state = r.trackingNumber() != null ? active.adapter().track(active.context(), r.trackingNumber())
                    : active.adapter().shipment(active.context(), r.externalId());
        } catch (CarrierException e) {
            throw new BusinessRuleException("CARRIER_ERROR", e.getMessage());
        }
        apply(shipmentId, r.orderId(), active.adapter().descriptor().name(), state, r.trackingNumber());
        return get(shipmentId);
    }

    public byte[] label(UUID shipmentId) {
        Row r = row(shipmentId);
        if (r.externalId() == null || r.status() == ShipmentStatus.PENDING || r.status() == ShipmentStatus.FAILED) {
            throw new BusinessRuleException("LABEL_NOT_READY", "Etykieta nie jest jeszcze gotowa — odśwież status przesyłki.");
        }
        var active = tx.execute(s -> accounts.active(r.carrierId()))
                .orElseThrow(() -> new BusinessRuleException("CARRIER_DISABLED", "Konto przewoźnika jest wyłączone."));
        try {
            return active.adapter().label(active.context(), r.externalId());
        } catch (CarrierException e) {
            throw new BusinessRuleException("CARRIER_ERROR", e.getMessage());
        }
    }

    // ------------------------------------------------------------------------------------------------ tracking job

    record Due(UUID tenantId, UUID shipmentId) {
    }

    @Scheduled(cron = "${shopivo.shipping.tracking-cron:0 */30 * * * *}")
    @SchedulerLock(name = "shipping.tracking", lockAtMostFor = "PT25M")
    public void trackAll() {
        List<Due> due = TenantContext.callAsSystem(() -> tx.execute(s -> jdbc.query("""
                select tenant_id, id from shipments
                where status in ('PENDING', 'READY', 'IN_TRANSIT', 'READY_FOR_PICKUP') and external_id is not null
                  and created_at > now() - interval '45 days'
                  and (last_checked_at is null or last_checked_at < now() - interval '25 minutes')
                order by last_checked_at nulls first limit 500
                """, (rs, i) -> new Due(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)))));
        for (Due d : due) {
            try {
                TenantContext.runInTenant(d.tenantId(), () -> refresh(d.shipmentId()));
            } catch (RuntimeException e) {
                log.warn("Tracking of shipment {} failed: {}", d.shipmentId(), e.getMessage());
                TenantContext.runInTenant(d.tenantId(), () -> tx.executeWithoutResult(s -> jdbc.update(
                        "update shipments set last_checked_at = now() where id = ?", d.shipmentId())));
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ internals

    /** Carrier-independent parcel checks (before anything is sent to the carrier). */
    static ParcelSpec validate(ShippingType type, ParcelSpec p) {
        if (type == ShippingType.PARCEL_LOCKER) {
            if (!List.of("small", "medium", "large").contains(p.template() == null ? "" : p.template())) {
                throw new BusinessRuleException("INVALID_PARCEL", "Wybierz gabaryt paczki: A (mała), B (średnia) lub C (duża).");
            }
            return new ParcelSpec(p.template(), null, null, null, null);
        }
        if (p.weightGrams() == null || p.weightGrams() < 1 || p.weightGrams() > 30_000) {
            throw new BusinessRuleException("INVALID_PARCEL", "Podaj wagę paczki (do 30 kg).");
        }
        for (Integer d : new Integer[] {p.lengthMm(), p.widthMm(), p.heightMm()}) {
            if (d == null || d < 10 || d > 3_000) throw new BusinessRuleException("INVALID_PARCEL", "Podaj wymiary paczki w milimetrach (10–3000).");
        }
        return new ParcelSpec(null, p.weightGrams(), p.lengthMm(), p.widthMm(), p.heightMm());
    }

    private void apply(UUID id, UUID orderId, String carrierName, CarrierShipment state, String knownTracking) {
        String tracking = state.trackingNumber() != null ? truncate(state.trackingNumber(), 100) : knownTracking;
        tx.executeWithoutResult(s -> {
            jdbc.update("""
                    update shipments set external_id = coalesce(?, external_id), tracking_number = coalesce(?, tracking_number), status = ?,
                        carrier_status = ?, error = null, updated_at = now(), last_checked_at = now(),
                        delivered_at = case when ? = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end
                    where id = ?
                    """, truncate(state.externalId(), 100), tracking, state.status().name(), truncate(state.carrierStatus(), 60),
                    state.status().name(), id);
            if (tracking != null && !tracking.equals(knownTracking)) orders.recordShipment(orderId, carrierName, tracking);
            if (state.status() == ShipmentStatus.DELIVERED) orders.markDelivered(orderId, carrierName);
        });
    }

    record Row(UUID id, UUID orderId, String carrierId, String externalId, String trackingNumber, ShipmentStatus status) {
    }

    private Row row(UUID id) {
        return tx.execute(s -> jdbc.query("select * from shipments where id = ? and tenant_id = ?", (rs, i) -> new Row(rs.getObject("id", UUID.class),
                rs.getObject("order_id", UUID.class), rs.getString("carrier_id"), rs.getString("external_id"), rs.getString("tracking_number"),
                ShipmentStatus.valueOf(rs.getString("status"))), id, TenantContext.requireTenantId()).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Nie znaleziono przesyłki.")));
    }

    private ShipmentView get(UUID id) {
        return tx.execute(s -> jdbc.query("select * from shipments where id = ? and tenant_id = ?", (rs, i) -> view(rs), id,
                TenantContext.requireTenantId()).stream().findFirst().orElseThrow(() -> new NotFoundException("Nie znaleziono przesyłki.")));
    }

    private ShipmentView view(java.sql.ResultSet rs) throws java.sql.SQLException {
        ShipmentStatus status = ShipmentStatus.valueOf(rs.getString("status"));
        String tracking = rs.getString("tracking_number");
        String carrier = rs.getString("carrier_id");
        String url = tracking == null ? null : accounts.adapterOf(carrier).map(a -> a.trackingUrl(tracking)).orElse(null);
        return new ShipmentView(rs.getObject("id", UUID.class), carrier, rs.getString("service"), tracking, url, status,
                rs.getString("carrier_status"), rs.getString("external_id") != null && status != ShipmentStatus.PENDING && status != ShipmentStatus.FAILED,
                rs.getString("error"), rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("delivered_at") == null ? null : rs.getTimestamp("delivered_at").toInstant(), rs.getBoolean("sandbox"));
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}

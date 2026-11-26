package pl.shopivo.shipping.internal;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import pl.shopivo.orders.OrderModel.ShippingType;
import pl.shopivo.shipping.CarrierAdapter;
import pl.shopivo.shipping.CarrierModels.CarrierContext;
import pl.shopivo.shipping.CarrierModels.CarrierDescriptor;
import pl.shopivo.shipping.CarrierModels.CarrierException;
import pl.shopivo.shipping.CarrierModels.CarrierShipment;
import pl.shopivo.shipping.CarrierModels.CredentialField;
import pl.shopivo.shipping.CarrierModels.Point;
import pl.shopivo.shipping.CarrierModels.ShipmentRequest;
import pl.shopivo.shipping.CarrierModels.ShipmentStatus;

/**
 * DEVELOPMENT AND TESTS ONLY (shopivo.shipping.fake-carrier.enabled=true; refused in production profiles). Behaves like
 * a carrier: lockers near any query, a label PDF, and tracking that reports "in transit" on the first check and
 * "delivered" afterwards.
 */
@Component
@ConditionalOnProperty(name = "shopivo.shipping.fake-carrier.enabled", havingValue = "true")
class FakeCarrier implements CarrierAdapter {

    private static final CarrierDescriptor DESCRIPTOR = new CarrierDescriptor("fake", "Symulator przewoźnika (dev)",
            "Tylko środowisko deweloperskie i testy — przesyłki nie są prawdziwe.",
            List.of(new CredentialField("apiKey", "Klucz API", true, "Dowolny ciąg znaków")),
            List.of(ShippingType.PARCEL_LOCKER, ShippingType.COURIER), null);

    private final Map<String, AtomicInteger> checks = new ConcurrentHashMap<>();

    FakeCarrier(Environment environment) {
        if (environment.matchesProfiles("prod | production | staging")) {
            throw new IllegalStateException("The fake carrier must not be enabled in production profiles");
        }
    }

    @Override
    public CarrierDescriptor descriptor() {
        return DESCRIPTOR;
    }

    @Override
    public void testConnection(CarrierContext ctx) {
        ctx.require("apiKey");
    }

    @Override
    public CarrierShipment createShipment(CarrierContext ctx, ShipmentRequest r) {
        ctx.require("apiKey");
        if (r.type() == ShippingType.PARCEL_LOCKER && (r.pointCode() == null || r.pointCode().isBlank())) {
            throw new CarrierException("Brak paczkomatu docelowego.");
        }
        String tracking = "FAKE" + String.valueOf(Math.abs(UUID.randomUUID().getMostSignificantBits())).substring(0, 12);
        return new CarrierShipment("fake-" + UUID.randomUUID(), tracking, "confirmed", ShipmentStatus.READY);
    }

    @Override
    public CarrierShipment shipment(CarrierContext ctx, String externalId) {
        return new CarrierShipment(externalId, null, "confirmed", ShipmentStatus.READY);
    }

    @Override
    public byte[] label(CarrierContext ctx, String externalId) {
        String pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
                + "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 298 420]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
        return pdf.getBytes(StandardCharsets.US_ASCII);
    }

    @Override
    public CarrierShipment track(CarrierContext ctx, String trackingNumber) {
        int n = checks.computeIfAbsent(trackingNumber, k -> new AtomicInteger()).incrementAndGet();
        return n == 1 ? new CarrierShipment(null, trackingNumber, "out_for_delivery", ShipmentStatus.IN_TRANSIT)
                : new CarrierShipment(null, trackingNumber, "delivered", ShipmentStatus.DELIVERED);
    }

    @Override
    public List<Point> searchPoints(boolean sandbox, String query) {
        String q = query == null ? "" : query.strip();
        if (q.length() < 2) return List.of();
        List<Point> points = new ArrayList<>();
        String prefix = q.replaceAll("[^A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż]", "").toUpperCase(Locale.ROOT);
        prefix = (prefix + "DEV").substring(0, 3).replaceAll("[^A-Z]", "X");
        for (int i = 1; i <= 3; i++) {
            String code = prefix + String.format("%02d", i) + "M";
            points.add(new Point(code, code, "ul. Testowa " + i + ", " + q, "Przy sklepie, czynny 24/7"));
        }
        return points;
    }

    @Override
    public Optional<Point> point(boolean sandbox, String code) {
        String c = code == null ? "" : code.strip().toUpperCase(Locale.ROOT);
        return c.matches("^[A-Z]{3}[0-9]{2,4}[A-Z]{0,3}$") ? Optional.of(new Point(c, c, "ul. Testowa 1", "Paczkomat testowy")) : Optional.empty();
    }

    @Override
    public String trackingUrl(String trackingNumber) {
        return "https://example.invalid/sledzenie/" + trackingNumber;
    }
}

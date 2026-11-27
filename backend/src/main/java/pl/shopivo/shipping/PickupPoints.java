package pl.shopivo.shipping;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.orders.OrderModel.PickupPoint;
import pl.shopivo.orders.OrderModel.ShippingType;
import pl.shopivo.orders.ShippingCarriers;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shipping.CarrierModels.CarrierException;
import pl.shopivo.shipping.CarrierModels.Point;

/** Parcel locker search for checkout and the carrier SPI for orders (method linking, point validation). */
@Service
public class PickupPoints implements ShippingCarriers {

    private final CarrierAccounts accounts;
    private final TransactionTemplate tx;
    /** Public carrier data; cached to spare the carrier API (and checkout latency). */
    private final Cache<String, List<Point>> searches = Caffeine.newBuilder().maximumSize(5_000).expireAfterWrite(Duration.ofMinutes(15)).build();

    PickupPoints(CarrierAccounts accounts, TransactionTemplate tx) {
        this.accounts = accounts;
        this.tx = tx;
    }

    public List<Point> search(String carrier, String query) {
        var active = tx.execute(s -> accounts.active(carrier))
                .orElseThrow(() -> new BusinessRuleException("SHIPPING_UNAVAILABLE", "Wybór paczkomatu jest chwilowo niedostępny."));
        String q = query == null ? "" : query.strip().toLowerCase(Locale.ROOT);
        if (q.length() < 2 || q.length() > 60) return List.of();
        try {
            return searches.get(carrier + ":" + active.sandbox() + ":" + q, k -> active.adapter().searchPoints(active.context(), active.service(), q));
        } catch (CarrierException e) {
            throw new BusinessRuleException("POINTS_UNAVAILABLE", "Nie udało się wyszukać paczkomatów. Spróbuj ponownie lub wpisz kod paczkomatu.");
        }
    }

    @Override
    public Map<String, String> enabled() {
        return tx.execute(s -> accounts.enabledNames());
    }

    @Override
    public boolean supports(String carrier, ShippingType type) {
        return accounts.supports(carrier, type);
    }

    @Override
    public java.util.Optional<String> trackingUrl(String carrier, String trackingNumber) {
        return accounts.adapterOf(carrier).map(a -> a.trackingUrl(trackingNumber));
    }

    @Override
    public PickupPoint pickupPoint(String carrier, String code) {
        var active = accounts.active(carrier)
                .orElseThrow(() -> new BusinessRuleException("SHIPPING_UNAVAILABLE", "Wybrany sposób dostawy jest niedostępny."));
        Point p;
        try {
            p = active.adapter().point(active.context(), active.service(), code)
                    .orElseThrow(() -> new BusinessRuleException("PICKUP_POINT_UNKNOWN", "Nie znaleziono paczkomatu " + code + "."));
        } catch (CarrierException e) {
            throw new BusinessRuleException("POINTS_UNAVAILABLE", e.getMessage());
        }
        return new PickupPoint(carrier, p.code(), p.name(), p.address());
    }
}

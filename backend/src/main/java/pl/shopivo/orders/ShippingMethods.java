package pl.shopivo.orders;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.orders.OrderModel.ShippingMethodView;
import pl.shopivo.orders.OrderModel.ShippingType;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/** Shipping methods with flat prices and an optional free-shipping threshold (carrier integrations: Phase 5). */
@Service
public class ShippingMethods {

    static final int MAX = 30;

    private final JdbcTemplate jdbc;
    /** Lazy: the shipping module depends on orders. */
    private final org.springframework.beans.factory.ObjectProvider<ShippingCarriers> carriers;

    ShippingMethods(JdbcTemplate jdbc, org.springframework.beans.factory.ObjectProvider<ShippingCarriers> carriers) {
        this.carriers = carriers;
        this.jdbc = jdbc;
    }

    public record ShippingInput(String name, String description, ShippingType type, long priceMinor, Long freeFromMinor,
            boolean active, Integer position, long version, String carrier) {
    }

    static final RowMapper<ShippingMethodView> MAPPER = (rs, i) -> new ShippingMethodView(rs.getObject("id", UUID.class),
            rs.getString("name"), rs.getString("description"), ShippingType.valueOf(rs.getString("type")), rs.getLong("price_minor"),
            rs.getObject("free_from_minor") == null ? null : rs.getLong("free_from_minor"), rs.getBoolean("active"),
            rs.getInt("position"), rs.getLong("version"), rs.getString("carrier"));

    @Transactional(readOnly = true)
    public List<ShippingMethodView> list(boolean activeOnly) {
        return jdbc.query("select * from shipping_methods where tenant_id = ?" + (activeOnly ? " and active" : "")
                + " order by position, lower(name)", MAPPER, TenantContext.requireTenantId());
    }

    @Transactional(readOnly = true)
    public ShippingMethodView get(UUID id) {
        return jdbc.query("select * from shipping_methods where id = ? and tenant_id = ?", MAPPER, id, TenantContext.requireTenantId())
                .stream().findFirst().orElseThrow(() -> new NotFoundException("Nie znaleziono metody dostawy."));
    }

    @Transactional
    public ShippingMethodView create(ShippingInput in) {
        validate(in);
        UUID tenant = TenantContext.requireTenantId();
        Integer count = jdbc.queryForObject("select count(*) from shipping_methods where tenant_id = ?", Integer.class, tenant);
        if (count != null && count >= MAX) throw new BusinessRuleException("SHIPPING_LIMIT", "Najwyżej " + MAX + " metod dostawy.");
        UUID id = UuidV7.generate();
        jdbc.update("""
                insert into shipping_methods (id, tenant_id, name, description, type, price_minor, free_from_minor, active, position, carrier)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, tenant, in.name().trim(), blank(in.description()), in.type().name(), in.priceMinor(), in.freeFromMinor(),
                in.active(), in.position() == null ? (count == null ? 0 : count) : in.position(), blank(in.carrier()));
        return get(id);
    }

    @Transactional
    public ShippingMethodView update(UUID id, ShippingInput in) {
        validate(in);
        int updated = jdbc.update("""
                update shipping_methods set name = ?, description = ?, type = ?, price_minor = ?, free_from_minor = ?, active = ?,
                    position = coalesce(?, position), carrier = ?, version = version + 1
                where id = ? and tenant_id = ? and version = ?
                """, in.name().trim(), blank(in.description()), in.type().name(), in.priceMinor(), in.freeFromMinor(), in.active(),
                in.position(), blank(in.carrier()), id, TenantContext.requireTenantId(), in.version());
        if (updated == 0) {
            get(id);
            throw new ConflictException("VERSION_CONFLICT", "Metoda dostawy została w międzyczasie zmieniona.");
        }
        return get(id);
    }

    @Transactional
    public void delete(UUID id) {
        if (jdbc.update("delete from shipping_methods where id = ? and tenant_id = ?", id, TenantContext.requireTenantId()) == 0) {
            throw new NotFoundException("Nie znaleziono metody dostawy.");
        }
    }

    /** Price for a cart value (free above the threshold). */
    static long priceFor(ShippingMethodView m, long subtotalMinor) {
        return m.freeFromMinor() != null && subtotalMinor >= m.freeFromMinor() ? 0 : m.priceMinor();
    }

    private void validate(ShippingInput in) {
        validateBasics(in);
        String carrier = blank(in.carrier());
        if (carrier != null) {
            ShippingCarriers c = carriers.getIfAvailable();
            if (c == null || !c.enabled().containsKey(carrier)) {
                throw new BusinessRuleException("CARRIER_NOT_CONNECTED", "Najpierw podłącz i włącz konto przewoźnika (Wysyłka → Przewoźnicy).");
            }
            if (!c.supports(carrier, in.type())) {
                throw new BusinessRuleException("CARRIER_UNSUPPORTED", "Ten przewoźnik nie obsługuje wybranego rodzaju dostawy.");
            }
        }
    }

    private static void validateBasics(ShippingInput in) {
        if (in.name() == null || in.name().isBlank() || in.name().trim().length() > 100) {
            throw new BusinessRuleException("INVALID_NAME", "Nazwa metody dostawy: 1–100 znaków.");
        }
        if (in.type() == null) throw new BusinessRuleException("INVALID_TYPE", "Wybierz rodzaj dostawy.");
        if (in.priceMinor() < 0 || in.priceMinor() > 10_000_000 || (in.freeFromMinor() != null && in.freeFromMinor() < 0)) {
            throw new BusinessRuleException("INVALID_PRICE", "Nieprawidłowa cena dostawy.");
        }
        if (in.description() != null && in.description().length() > 300) {
            throw new BusinessRuleException("TOO_LONG", "Opis może mieć najwyżej 300 znaków.");
        }
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

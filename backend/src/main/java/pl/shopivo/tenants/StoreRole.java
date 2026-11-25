package pl.shopivo.tenants;

import static pl.shopivo.tenants.StorePermission.*;

import java.util.EnumSet;
import java.util.Set;

/** Store team roles and the permissions they grant. Single source of truth for authorization in a tenant. */
public enum StoreRole {
    OWNER(EnumSet.allOf(StorePermission.class), "Właściciel"),
    ADMIN(EnumSet.complementOf(EnumSet.of(STORE_DELETE, BILLING_MANAGE)), "Administrator"),
    MANAGER(EnumSet.of(STORE_READ, STORE_SETTINGS_WRITE, TEAM_READ, PRODUCTS_READ, PRODUCTS_WRITE, ORDERS_READ,
            ORDERS_WRITE, CUSTOMERS_READ, CUSTOMERS_WRITE, THEMES_WRITE, CONTENT_WRITE, SEO_WRITE, MARKETING_WRITE,
            ANALYTICS_READ), "Menedżer"),
    PRODUCT_MANAGER(EnumSet.of(STORE_READ, PRODUCTS_READ, PRODUCTS_WRITE, CONTENT_WRITE, SEO_WRITE), "Menedżer produktów"),
    ORDER_MANAGER(EnumSet.of(STORE_READ, PRODUCTS_READ, ORDERS_READ, ORDERS_WRITE, CUSTOMERS_READ), "Obsługa zamówień"),
    CUSTOMER_SUPPORT(EnumSet.of(STORE_READ, PRODUCTS_READ, ORDERS_READ, CUSTOMERS_READ, CUSTOMERS_WRITE), "Obsługa klienta");

    private final Set<StorePermission> permissions;
    private final String label;

    StoreRole(Set<StorePermission> permissions, String label) {
        this.permissions = Set.copyOf(permissions);
        this.label = label;
    }

    public Set<StorePermission> permissions() {
        return permissions;
    }

    public boolean has(StorePermission permission) {
        return permissions.contains(permission);
    }

    public String label() {
        return label;
    }
}

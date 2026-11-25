package pl.shopivo.tenants;

/** Fine-grained permissions inside a store (tenant). See docs/SECURITY.md §3. */
public enum StorePermission {
    STORE_READ,
    STORE_SETTINGS_WRITE,
    STORE_DELETE,
    TEAM_READ,
    TEAM_MANAGE,
    BILLING_MANAGE,
    PRODUCTS_READ,
    PRODUCTS_WRITE,
    ORDERS_READ,
    ORDERS_WRITE,
    CUSTOMERS_READ,
    CUSTOMERS_WRITE,
    THEMES_WRITE,
    CONTENT_WRITE,
    SEO_WRITE,
    MARKETING_WRITE,
    INTEGRATIONS_MANAGE,
    DOMAINS_MANAGE,
    ANALYTICS_READ,
    AUDIT_READ
}

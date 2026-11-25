-- =====================================================================================
-- V5 — customers, shipping methods, payment settings, carts, orders (with stock
-- reservations), order history and notes. All tenant data with RLS.
-- =====================================================================================

CREATE TABLE customers
(
    id                  uuid PRIMARY KEY,
    tenant_id           uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    email               varchar(320) NOT NULL,
    first_name          varchar(100),
    last_name           varchar(100),
    phone               varchar(30),
    accepts_marketing   boolean      NOT NULL DEFAULT false,
    marketing_consent_at timestamptz,
    note                varchar(2000),
    orders_count        integer      NOT NULL DEFAULT 0,
    total_spent_minor   bigint       NOT NULL DEFAULT 0,
    last_order_at       timestamptz,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),
    version             bigint       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX customers_email_uk ON customers (tenant_id, lower(email));
CREATE INDEX customers_tenant_last_order_idx ON customers (tenant_id, last_order_at DESC NULLS LAST);

CREATE TABLE shipping_methods
(
    id                uuid PRIMARY KEY,
    tenant_id         uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name              varchar(100) NOT NULL,
    description       varchar(300),
    type              varchar(20)  NOT NULL,
    price_minor       bigint       NOT NULL,
    free_from_minor   bigint,
    active            boolean      NOT NULL DEFAULT true,
    position          integer      NOT NULL DEFAULT 0,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    version           bigint       NOT NULL DEFAULT 0,
    CONSTRAINT shipping_methods_type_ck CHECK (type IN ('COURIER', 'PARCEL_LOCKER', 'POST', 'PICKUP', 'DIGITAL')),
    CONSTRAINT shipping_methods_price_ck CHECK (price_minor >= 0 AND (free_from_minor IS NULL OR free_from_minor >= 0))
);
CREATE INDEX shipping_methods_tenant_idx ON shipping_methods (tenant_id, position);

-- Offline payment methods available before operator integrations (Phase 5).
CREATE TABLE store_payment_settings
(
    tenant_id              uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    bank_transfer_enabled  boolean      NOT NULL DEFAULT false,
    bank_account_holder    varchar(200),
    bank_account_number    varchar(34),
    bank_name              varchar(100),
    cod_enabled            boolean      NOT NULL DEFAULT false,
    cod_fee_minor          bigint       NOT NULL DEFAULT 0,
    unpaid_cancel_days     integer      NOT NULL DEFAULT 7,
    updated_at             timestamptz  NOT NULL DEFAULT now(),
    version                bigint       NOT NULL DEFAULT 0,
    CONSTRAINT store_payment_settings_ck CHECK (cod_fee_minor >= 0 AND unpaid_cancel_days BETWEEN 1 AND 60)
);

CREATE TABLE carts
(
    id          uuid PRIMARY KEY,
    tenant_id   uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    token_hash  varchar(64) NOT NULL,
    status      varchar(20) NOT NULL DEFAULT 'OPEN',
    order_id    uuid,
    currency    varchar(3)  NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT carts_token_uk UNIQUE (token_hash),
    CONSTRAINT carts_status_ck CHECK (status IN ('OPEN', 'CONVERTED'))
);
CREATE INDEX carts_tenant_updated_idx ON carts (tenant_id, updated_at);

CREATE TABLE cart_items
(
    cart_id    uuid        NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
    tenant_id  uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    variant_id uuid        NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
    quantity   integer     NOT NULL,
    added_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cart_id, variant_id),
    CONSTRAINT cart_items_qty_ck CHECK (quantity BETWEEN 1 AND 999)
);

-- Per-tenant sequential numbers (order numbers are per store: 1001, 1002, …).
CREATE TABLE tenant_counters
(
    tenant_id  uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name       varchar(40) NOT NULL,
    value      bigint      NOT NULL,
    PRIMARY KEY (tenant_id, name)
);

CREATE TABLE orders
(
    id                    uuid PRIMARY KEY,
    tenant_id             uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    number                bigint       NOT NULL,
    public_token_hash     varchar(64)  NOT NULL,
    source                varchar(20)  NOT NULL,
    status                varchar(20)  NOT NULL,
    payment_status        varchar(20)  NOT NULL,
    payment_method        varchar(20)  NOT NULL,
    customer_id           uuid REFERENCES customers (id) ON DELETE SET NULL,
    email                 varchar(320) NOT NULL,
    phone                 varchar(30),
    first_name            varchar(100) NOT NULL,
    last_name             varchar(100) NOT NULL,
    shipping_address_json text,
    billing_json          text,
    shipping_method_id    uuid REFERENCES shipping_methods (id) ON DELETE SET NULL,
    shipping_method_name  varchar(100),
    shipping_minor        bigint       NOT NULL DEFAULT 0,
    payment_fee_minor     bigint       NOT NULL DEFAULT 0,
    subtotal_minor        bigint       NOT NULL,
    discount_minor        bigint       NOT NULL DEFAULT 0,
    total_minor           bigint       NOT NULL,
    tax_minor             bigint       NOT NULL,
    currency              varchar(3)   NOT NULL,
    customer_note         varchar(1000),
    tracking_number       varchar(80),
    terms_accepted_at     timestamptz,
    paid_at               timestamptz,
    shipped_at            timestamptz,
    completed_at          timestamptz,
    canceled_at           timestamptz,
    cancel_reason         varchar(300),
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    version               bigint       NOT NULL DEFAULT 0,
    CONSTRAINT orders_number_uk UNIQUE (tenant_id, number),
    CONSTRAINT orders_token_uk UNIQUE (public_token_hash),
    CONSTRAINT orders_status_ck CHECK (status IN ('NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELED')),
    CONSTRAINT orders_payment_status_ck CHECK (payment_status IN ('UNPAID', 'PAID', 'REFUNDED')),
    CONSTRAINT orders_payment_method_ck CHECK (payment_method IN ('BANK_TRANSFER', 'COD', 'MANUAL')),
    CONSTRAINT orders_source_ck CHECK (source IN ('STOREFRONT', 'PANEL')),
    CONSTRAINT orders_amounts_ck CHECK (subtotal_minor >= 0 AND total_minor >= 0 AND tax_minor >= 0)
);
CREATE INDEX orders_tenant_created_idx ON orders (tenant_id, created_at DESC);
CREATE INDEX orders_tenant_status_idx ON orders (tenant_id, status, created_at DESC);
CREATE INDEX orders_customer_idx ON orders (tenant_id, customer_id);

CREATE TABLE order_items
(
    id               uuid PRIMARY KEY,
    tenant_id        uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    order_id         uuid         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id       uuid REFERENCES products (id) ON DELETE SET NULL,
    variant_id       uuid REFERENCES product_variants (id) ON DELETE SET NULL,
    name             varchar(200) NOT NULL,
    variant_title    varchar(200),
    sku              varchar(64),
    quantity         integer      NOT NULL,
    unit_price_minor bigint       NOT NULL,
    vat_rate_bps     integer      NOT NULL,
    line_total_minor bigint       NOT NULL,
    -- Quantity whose stock is reserved (released on cancel, written off on shipment).
    reserved_qty     integer      NOT NULL DEFAULT 0,
    position         integer      NOT NULL,
    CONSTRAINT order_items_qty_ck CHECK (quantity > 0 AND reserved_qty >= 0 AND reserved_qty <= quantity)
);
CREATE INDEX order_items_order_idx ON order_items (tenant_id, order_id, position);

CREATE TABLE order_events
(
    id            uuid PRIMARY KEY,
    tenant_id     uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    order_id      uuid         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    type          varchar(40)  NOT NULL,
    message       varchar(1000),
    internal      boolean      NOT NULL DEFAULT true,
    actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (tenant_id, order_id, created_at);

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['customers', 'shipping_methods', 'store_payment_settings', 'carts', 'cart_items',
                             'tenant_counters', 'orders', 'order_items', 'order_events']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END
$$;

REVOKE UPDATE, DELETE ON order_events FROM ${appRole};

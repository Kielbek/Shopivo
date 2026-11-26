-- =====================================================================================
-- V13 — carrier integrations: the merchant's own carrier account (InPost ShipX), shipping
-- methods linked to a carrier, the pickup point chosen at checkout, and shipments with
-- labels and tracking.
-- =====================================================================================

ALTER TABLE shipping_methods ADD COLUMN carrier varchar(30);
ALTER TABLE orders ADD COLUMN pickup_point_json text;
-- Carrier of the shipping method at the time of the order (the method may be relinked later).
ALTER TABLE orders ADD COLUMN shipping_carrier varchar(30);

CREATE TABLE store_carrier_accounts
(
    tenant_id       uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    carrier_id      varchar(30)  NOT NULL,
    credentials_enc text         NOT NULL,
    sandbox         boolean      NOT NULL DEFAULT true,
    enabled         boolean      NOT NULL DEFAULT false,
    verified_at     timestamptz,
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    version         bigint       NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, carrier_id)
);

CREATE TABLE shipments
(
    id               uuid PRIMARY KEY,
    tenant_id        uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    order_id         uuid         NOT NULL,
    carrier_id       varchar(30)  NOT NULL,
    service          varchar(40)  NOT NULL,
    external_id      varchar(100),
    tracking_number  varchar(100),
    status           varchar(20)  NOT NULL,
    carrier_status   varchar(60),
    parcel_json      text         NOT NULL,
    sandbox          boolean      NOT NULL,
    error            varchar(500),
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    delivered_at     timestamptz,
    last_checked_at  timestamptz,
    CONSTRAINT shipments_status_ck CHECK (status IN ('PENDING', 'READY', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'DELIVERED', 'RETURNED', 'FAILED', 'CANCELED'))
);
CREATE INDEX shipments_order_idx ON shipments (tenant_id, order_id, created_at DESC);
CREATE INDEX shipments_tracking_idx ON shipments (status, last_checked_at) WHERE status IN ('PENDING', 'READY', 'IN_TRANSIT', 'READY_FOR_PICKUP');

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['store_carrier_accounts', 'shipments']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END
$$;

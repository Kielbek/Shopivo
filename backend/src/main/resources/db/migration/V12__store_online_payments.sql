-- =====================================================================================
-- V12 — online payments of stores with the merchant's own operator account
-- (Przelewy24 / PayU / Tpay). Credentials are encrypted (AES-GCM, bound to the store and
-- operator); every payment attempt and every operator notification is recorded.
-- =====================================================================================

ALTER TABLE orders DROP CONSTRAINT orders_payment_method_ck;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_ck CHECK (payment_method IN ('BANK_TRANSFER', 'COD', 'MANUAL', 'ONLINE'));

-- One operator per store.
CREATE TABLE store_payment_providers
(
    tenant_id       uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    provider_id     varchar(30)  NOT NULL,
    credentials_enc text         NOT NULL,
    sandbox         boolean      NOT NULL DEFAULT true,
    enabled         boolean      NOT NULL DEFAULT false,
    verified_at     timestamptz,
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    version         bigint       NOT NULL DEFAULT 0
);

CREATE TABLE order_payments
(
    id                  uuid PRIMARY KEY,
    tenant_id           uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    order_id            uuid         NOT NULL,
    provider_id         varchar(30)  NOT NULL,
    provider_payment_id varchar(200),
    amount_minor        bigint       NOT NULL,
    currency            varchar(3)   NOT NULL,
    status              varchar(10)  NOT NULL DEFAULT 'PENDING',
    sandbox             boolean      NOT NULL,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    paid_at             timestamptz,
    CONSTRAINT order_payments_status_ck CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
    CONSTRAINT order_payments_amount_ck CHECK (amount_minor > 0)
);
CREATE INDEX order_payments_order_idx ON order_payments (tenant_id, order_id, created_at DESC);

-- Operator notifications (idempotency: the same event is applied once).
CREATE TABLE store_payment_events
(
    id          uuid PRIMARY KEY,
    tenant_id   uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    provider_id varchar(30)  NOT NULL,
    event_key   varchar(300) NOT NULL,
    payment_id  uuid,
    outcome     varchar(30)  NOT NULL,
    received_at timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT store_payment_events_uk UNIQUE (tenant_id, provider_id, event_key)
);

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['store_payment_providers', 'order_payments', 'store_payment_events']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END
$$;

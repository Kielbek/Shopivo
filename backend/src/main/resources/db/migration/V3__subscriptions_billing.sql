-- =====================================================================================
-- V3 — SaaS subscriptions & billing (phase 2)
-- Plans, prices and entitlements are DATA (editable by platform administrators), never constants in code.
-- The subscription lifecycle is managed by Shopivo; Polish payment operators (Przelewy24, PayU, Tpay) only collect
-- individual payments through payment links (BLIK, bank transfer, card).
-- Tenant-owned tables use the standard RLS policy; catalogue/webhook tables are platform-level (no RLS).
-- =====================================================================================

-- ---------------------------------------------------------------- catalogue (platform level)
CREATE TABLE subscription_plans
(
    id          uuid PRIMARY KEY,
    code        varchar(40)  NOT NULL,
    name        varchar(100) NOT NULL,
    description varchar(500),
    sort_order  integer      NOT NULL DEFAULT 0,
    active      boolean      NOT NULL DEFAULT true,
    public      boolean      NOT NULL DEFAULT true,
    trial_days  integer      NOT NULL DEFAULT 0,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    version     bigint       NOT NULL DEFAULT 0,
    CONSTRAINT subscription_plans_code_uk UNIQUE (code),
    CONSTRAINT subscription_plans_code_ck CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
    CONSTRAINT subscription_plans_trial_ck CHECK (trial_days BETWEEN 0 AND 90)
);

CREATE TABLE plan_prices
(
    id                uuid PRIMARY KEY,
    plan_id           uuid        NOT NULL REFERENCES subscription_plans (id) ON DELETE CASCADE,
    billing_interval  varchar(10) NOT NULL,
    currency          varchar(3)  NOT NULL,
    amount_minor      bigint      NOT NULL,
    active            boolean     NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plan_prices_interval_ck CHECK (billing_interval IN ('MONTH', 'YEAR')),
    CONSTRAINT plan_prices_amount_ck CHECK (amount_minor >= 0)
);
CREATE UNIQUE INDEX plan_prices_active_uk ON plan_prices (plan_id, billing_interval, currency) WHERE active;

CREATE TABLE plan_entitlements
(
    plan_id   uuid        NOT NULL REFERENCES subscription_plans (id) ON DELETE CASCADE,
    key       varchar(60) NOT NULL,
    value     varchar(60) NOT NULL,
    PRIMARY KEY (plan_id, key)
);

CREATE TABLE billing_coupons
(
    id                 uuid PRIMARY KEY,
    code               varchar(40)  NOT NULL,
    description        varchar(200),
    percent_off        integer,
    amount_off_minor   bigint,
    currency           varchar(3),
    duration           varchar(10)  NOT NULL,
    duration_months    integer,
    max_redemptions    integer,
    redeemed_count     integer      NOT NULL DEFAULT 0,
    valid_until        timestamptz,
    active             boolean      NOT NULL DEFAULT true,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    version            bigint       NOT NULL DEFAULT 0,
    CONSTRAINT billing_coupons_code_uk UNIQUE (code),
    CONSTRAINT billing_coupons_duration_ck CHECK (duration IN ('ONCE', 'REPEATING', 'FOREVER')),
    CONSTRAINT billing_coupons_value_ck CHECK (
        (percent_off BETWEEN 1 AND 100 AND amount_off_minor IS NULL)
        OR (percent_off IS NULL AND amount_off_minor > 0 AND currency IS NOT NULL)),
    CONSTRAINT billing_coupons_months_ck CHECK (duration <> 'REPEATING' OR duration_months BETWEEN 1 AND 36)
);

-- Payment operators configured by the platform owner for subscription billing (Przelewy24, PayU, Tpay, ...).
-- Credentials are AES-GCM encrypted by the application (SecretEncryptor), never stored in plain text.
CREATE TABLE platform_payment_providers
(
    provider              varchar(30) PRIMARY KEY,
    enabled               boolean      NOT NULL DEFAULT false,
    sandbox               boolean      NOT NULL DEFAULT true,
    credentials_encrypted text,
    active_for_billing    boolean      NOT NULL DEFAULT false,
    last_test_at          timestamptz,
    last_test_ok          boolean,
    updated_by            uuid REFERENCES users (id),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    version               bigint       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX platform_payment_providers_active_uk ON platform_payment_providers (active_for_billing) WHERE active_for_billing;

-- Inbound provider webhooks: idempotency (provider, event_id) and retry bookkeeping.
CREATE TABLE webhook_events
(
    id           uuid PRIMARY KEY,
    provider     varchar(30)  NOT NULL,
    event_id     varchar(120) NOT NULL,
    type         varchar(80)  NOT NULL,
    status       varchar(20)  NOT NULL,
    attempts     integer      NOT NULL DEFAULT 0,
    last_error   varchar(500),
    payload      text         NOT NULL,
    received_at  timestamptz  NOT NULL DEFAULT now(),
    processed_at timestamptz,
    CONSTRAINT webhook_events_uk UNIQUE (provider, event_id),
    CONSTRAINT webhook_events_status_ck CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'))
);
CREATE INDEX webhook_events_retry_idx ON webhook_events (status, received_at) WHERE status = 'FAILED';

-- ---------------------------------------------------------------- tenant data (RLS)
CREATE TABLE subscriptions
(
    id                       uuid PRIMARY KEY,
    tenant_id                uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    plan_id                  uuid        NOT NULL REFERENCES subscription_plans (id),
    price_id                 uuid REFERENCES plan_prices (id),
    status                   varchar(20) NOT NULL,
    billing_interval         varchar(10),
    trial_ends_at            timestamptz,
    current_period_start     timestamptz,
    current_period_end       timestamptz,
    cancel_at_period_end     boolean     NOT NULL DEFAULT false,
    canceled_at              timestamptz,
    grace_until              timestamptz,
    pending_plan_id          uuid REFERENCES subscription_plans (id),
    pending_price_id         uuid REFERENCES plan_prices (id),
    coupon_id                uuid REFERENCES billing_coupons (id),
    coupon_charges_used      integer     NOT NULL DEFAULT 0,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    version                  bigint      NOT NULL DEFAULT 0,
    CONSTRAINT subscriptions_tenant_uk UNIQUE (tenant_id),
    CONSTRAINT subscriptions_status_ck CHECK (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED')),
    CONSTRAINT subscriptions_interval_ck CHECK (billing_interval IS NULL OR billing_interval IN ('MONTH', 'YEAR'))
);
CREATE INDEX subscriptions_status_idx ON subscriptions (status);
CREATE INDEX subscriptions_trial_idx ON subscriptions (trial_ends_at) WHERE status = 'TRIALING';
CREATE INDEX subscriptions_grace_idx ON subscriptions (grace_until) WHERE status = 'PAST_DUE';
CREATE INDEX subscriptions_period_end_idx ON subscriptions (current_period_end) WHERE status IN ('ACTIVE', 'PAST_DUE');

CREATE TABLE subscription_events
(
    id              uuid PRIMARY KEY,
    tenant_id       uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    subscription_id uuid        NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
    type            varchar(60) NOT NULL,
    from_status     varchar(20),
    to_status       varchar(20),
    plan_code       varchar(40),
    detail          varchar(500),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_events_tenant_idx ON subscription_events (tenant_id, created_at DESC);

-- Amounts the platform asks a merchant to pay (initial purchase, renewal, upgrade proration). Paid through the
-- configured operator via a payment link. NOT a VAT invoice — invoicing/KSeF is a separate decision (Q-06).
CREATE SEQUENCE subscription_charge_number_seq;

CREATE TABLE subscription_charges
(
    id                  uuid PRIMARY KEY,
    tenant_id           uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    subscription_id     uuid         NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
    number              varchar(30)  NOT NULL,
    kind                varchar(20)  NOT NULL,
    status              varchar(20)  NOT NULL,
    plan_id             uuid         NOT NULL REFERENCES subscription_plans (id),
    price_id            uuid         NOT NULL REFERENCES plan_prices (id),
    billing_interval    varchar(10)  NOT NULL,
    period_start        timestamptz  NOT NULL,
    period_end          timestamptz  NOT NULL,
    list_amount_minor   bigint       NOT NULL,
    discount_minor      bigint       NOT NULL DEFAULT 0,
    amount_minor        bigint       NOT NULL,
    tax_rate_bps        integer      NOT NULL,
    tax_minor           bigint       NOT NULL,
    total_minor         bigint       NOT NULL,
    currency            varchar(3)   NOT NULL,
    description         varchar(300),
    coupon_id           uuid REFERENCES billing_coupons (id),
    provider            varchar(30),
    provider_payment_id varchar(120),
    payment_url         varchar(1000),
    reminders_sent      integer      NOT NULL DEFAULT 0,
    last_reminder_at    timestamptz,
    due_at              timestamptz  NOT NULL,
    issued_at           timestamptz  NOT NULL DEFAULT now(),
    paid_at             timestamptz,
    version             bigint       NOT NULL DEFAULT 0,
    CONSTRAINT subscription_charges_number_uk UNIQUE (number),
    CONSTRAINT subscription_charges_kind_ck CHECK (kind IN ('INITIAL', 'RENEWAL', 'UPGRADE')),
    CONSTRAINT subscription_charges_status_ck CHECK (status IN ('OPEN', 'PAID', 'FAILED', 'VOID')),
    CONSTRAINT subscription_charges_amount_ck CHECK (amount_minor >= 0 AND discount_minor >= 0 AND tax_minor >= 0 AND total_minor = amount_minor + tax_minor)
);
CREATE INDEX subscription_charges_tenant_idx ON subscription_charges (tenant_id, issued_at DESC);
CREATE INDEX subscription_charges_open_idx ON subscription_charges (status, due_at) WHERE status = 'OPEN';
CREATE UNIQUE INDEX subscription_charges_open_kind_uk ON subscription_charges (subscription_id, kind) WHERE status = 'OPEN';

CREATE TABLE coupon_redemptions
(
    coupon_id   uuid        NOT NULL REFERENCES billing_coupons (id),
    tenant_id   uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    redeemed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (coupon_id, tenant_id)
);

CREATE TABLE entitlement_overrides
(
    tenant_id  uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    key        varchar(60)  NOT NULL,
    value      varchar(60)  NOT NULL,
    reason     varchar(300) NOT NULL,
    created_by uuid REFERENCES users (id),
    expires_at timestamptz,
    created_at timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, key)
);

-- Monthly usage counters per tenant (fair-use, limits, cost visibility).
CREATE TABLE tenant_usage
(
    tenant_id uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    metric    varchar(60) NOT NULL,
    period    date        NOT NULL,
    value     bigint      NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, metric, period)
);
CREATE INDEX tenant_usage_period_idx ON tenant_usage (period, metric);

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['subscriptions', 'subscription_events', 'subscription_charges', 'coupon_redemptions',
                             'entitlement_overrides', 'tenant_usage']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END
$$;

-- History is append-only for the application role.
REVOKE UPDATE, DELETE ON subscription_events FROM ${appRole};
GRANT USAGE, SELECT ON SEQUENCE subscription_charge_number_seq TO ${appRole};

-- ---------------------------------------------------------------- initial example plans (editable in the admin panel)
-- Prices are NET amounts in grosze (minor units). They are examples to be set by the platform owner (Q-05).
INSERT INTO subscription_plans (id, code, name, description, sort_order, trial_days) VALUES
    ('0190a000-0000-7000-8000-000000000001', 'STARTER', 'Starter', 'Na start: do 100 produktów i adres w domenie Shopivo.', 10, 14),
    ('0190a000-0000-7000-8000-000000000002', 'BUSINESS', 'Business', 'Własna domena, marketing, integracje i zaawansowane statystyki.', 20, 14),
    ('0190a000-0000-7000-8000-000000000003', 'PROFESSIONAL', 'Professional', 'Wyższe limity, narzędzia AI i priorytetowe wsparcie.', 30, 14);

INSERT INTO plan_prices (id, plan_id, billing_interval, currency, amount_minor) VALUES
    ('0190a001-0000-7000-8000-000000000001', '0190a000-0000-7000-8000-000000000001', 'MONTH', 'PLN', 7900),
    ('0190a001-0000-7000-8000-000000000002', '0190a000-0000-7000-8000-000000000001', 'YEAR', 'PLN', 79000),
    ('0190a001-0000-7000-8000-000000000003', '0190a000-0000-7000-8000-000000000002', 'MONTH', 'PLN', 19900),
    ('0190a001-0000-7000-8000-000000000004', '0190a000-0000-7000-8000-000000000002', 'YEAR', 'PLN', 199000),
    ('0190a001-0000-7000-8000-000000000005', '0190a000-0000-7000-8000-000000000003', 'MONTH', 'PLN', 44900),
    ('0190a001-0000-7000-8000-000000000006', '0190a000-0000-7000-8000-000000000003', 'YEAR', 'PLN', 449000);

-- -1 = unlimited. Hard limits block the action; soft (fair-use) limits only notify and flag.
INSERT INTO plan_entitlements (plan_id, key, value)
SELECT p.id, e.key, e.value
FROM subscription_plans p
JOIN (VALUES
    ('STARTER', 'products.max', '100'), ('STARTER', 'staff.max', '2'), ('STARTER', 'storage.max_mb', '1024'),
    ('STARTER', 'orders.monthly.fair_use', '300'), ('STARTER', 'storefront.requests.monthly.fair_use', '300000'),
    ('STARTER', 'ai.monthly_credits', '0'), ('STARTER', 'fees.transaction_bps', '0'),
    ('STARTER', 'domains.custom', 'false'), ('STARTER', 'themes.premium', 'false'), ('STARTER', 'marketing.tools', 'false'),
    ('STARTER', 'integrations.external', 'false'), ('STARTER', 'analytics.advanced', 'false'), ('STARTER', 'support.priority', 'false'),
    ('BUSINESS', 'products.max', '1000'), ('BUSINESS', 'staff.max', '5'), ('BUSINESS', 'storage.max_mb', '10240'),
    ('BUSINESS', 'orders.monthly.fair_use', '3000'), ('BUSINESS', 'storefront.requests.monthly.fair_use', '3000000'),
    ('BUSINESS', 'ai.monthly_credits', '0'), ('BUSINESS', 'fees.transaction_bps', '0'),
    ('BUSINESS', 'domains.custom', 'true'), ('BUSINESS', 'themes.premium', 'true'), ('BUSINESS', 'marketing.tools', 'true'),
    ('BUSINESS', 'integrations.external', 'true'), ('BUSINESS', 'analytics.advanced', 'true'), ('BUSINESS', 'support.priority', 'false'),
    ('PROFESSIONAL', 'products.max', '25000'), ('PROFESSIONAL', 'staff.max', '15'), ('PROFESSIONAL', 'storage.max_mb', '51200'),
    ('PROFESSIONAL', 'orders.monthly.fair_use', '-1'), ('PROFESSIONAL', 'storefront.requests.monthly.fair_use', '20000000'),
    ('PROFESSIONAL', 'ai.monthly_credits', '1000'), ('PROFESSIONAL', 'fees.transaction_bps', '0'),
    ('PROFESSIONAL', 'domains.custom', 'true'), ('PROFESSIONAL', 'themes.premium', 'true'), ('PROFESSIONAL', 'marketing.tools', 'true'),
    ('PROFESSIONAL', 'integrations.external', 'true'), ('PROFESSIONAL', 'analytics.advanced', 'true'), ('PROFESSIONAL', 'support.priority', 'true')
) AS e(plan_code, key, value) ON e.plan_code = p.code;

-- Existing stores (created before billing existed) start a trial now.
INSERT INTO subscriptions (id, tenant_id, plan_id, status, trial_ends_at)
SELECT gen_random_uuid(), t.id, '0190a000-0000-7000-8000-000000000002', 'TRIALING', now() + interval '14 days'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id);

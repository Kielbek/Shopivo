-- =====================================================================================
-- V10 — customer accounts of a store (separate from platform users and from other stores).
-- Sessions, verification and reset tokens are stored as SHA-256 hashes only.
-- =====================================================================================

CREATE TABLE customer_accounts
(
    id                uuid PRIMARY KEY,
    tenant_id         uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    email             varchar(254) NOT NULL,
    password_hash     varchar(200) NOT NULL,
    first_name        varchar(80)  NOT NULL,
    last_name         varchar(80)  NOT NULL,
    phone             varchar(30),
    email_verified_at timestamptz,
    failed_logins     integer      NOT NULL DEFAULT 0,
    locked_until      timestamptz,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT customer_accounts_email_lower_ck CHECK (email = lower(email)),
    CONSTRAINT customer_accounts_email_uk UNIQUE (tenant_id, email)
);

CREATE TABLE customer_account_tokens
(
    id         uuid PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    account_id uuid        NOT NULL REFERENCES customer_accounts (id) ON DELETE CASCADE,
    purpose    varchar(10) NOT NULL,
    token_hash varchar(64) NOT NULL,
    -- VERIFY only: the password chosen in the registration this link belongs to. Confirming the e-mail activates
    -- exactly that password, so someone who re-registers a stranger's unverified address cannot get into the account.
    pending_password_hash varchar(200),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customer_account_tokens_purpose_ck CHECK (purpose IN ('VERIFY', 'RESET')),
    CONSTRAINT customer_account_tokens_hash_uk UNIQUE (token_hash)
);
CREATE INDEX customer_account_tokens_account_idx ON customer_account_tokens (account_id, purpose);

CREATE TABLE customer_sessions
(
    id           uuid PRIMARY KEY,
    tenant_id    uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    account_id   uuid        NOT NULL REFERENCES customer_accounts (id) ON DELETE CASCADE,
    token_hash   varchar(64) NOT NULL,
    expires_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customer_sessions_hash_uk UNIQUE (token_hash)
);
CREATE INDEX customer_sessions_account_idx ON customer_sessions (account_id);
CREATE INDEX customer_sessions_expiry_idx ON customer_sessions (expires_at);

CREATE TABLE customer_addresses
(
    id           uuid PRIMARY KEY,
    tenant_id    uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    account_id   uuid         NOT NULL REFERENCES customer_accounts (id) ON DELETE CASCADE,
    name         varchar(120) NOT NULL,
    company      varchar(200),
    line1        varchar(200) NOT NULL,
    line2        varchar(200),
    postal_code  varchar(10)  NOT NULL,
    city         varchar(100) NOT NULL,
    country_code varchar(2)   NOT NULL DEFAULT 'PL',
    phone        varchar(30),
    is_default   boolean      NOT NULL DEFAULT false,
    created_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_account_idx ON customer_addresses (account_id);

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['customer_accounts', 'customer_account_tokens', 'customer_sessions', 'customer_addresses']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END
$$;

-- Order history of a customer account (orders are matched by the verified e-mail).
CREATE INDEX orders_email_lower_idx ON orders (tenant_id, lower(email));

-- =====================================================================================
-- Shopivo V1 — core platform: users, sessions, tenants, memberships, stores, domains, audit
-- Executed by the schema owner role. The application connects as ${appRole}
-- (no BYPASSRLS, not the owner) so Row Level Security policies apply to it.
-- =====================================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        RAISE EXCEPTION 'Database role "${appRole}" does not exist. Create it before running migrations (see docs/DEPLOYMENT.md).';
    END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS citext;

-- Privileges for objects created by the migration role from now on.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appRole};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${appRole};
GRANT USAGE ON SCHEMA public TO ${appRole};

-- ---------------------------------------------------------------------------------
-- RLS helper functions. Session variables are set by TenantAwareDataSource on every
-- connection checkout (see docs/ARCHITECTURE.md ADR-003).
-- ---------------------------------------------------------------------------------
CREATE FUNCTION app_current_tenant() RETURNS uuid
    LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION app_current_user() RETURNS uuid
    LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app_bypass_rls() RETURNS boolean
    LANGUAGE sql STABLE AS
$$ SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on' $$;

-- ---------------------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------------------
CREATE TABLE users
(
    id                 uuid PRIMARY KEY,
    email              citext       NOT NULL,
    password_hash      varchar(255),
    first_name         varchar(100) NOT NULL,
    last_name          varchar(100) NOT NULL,
    status             varchar(30)  NOT NULL,
    platform_role      varchar(30),
    email_verified_at  timestamptz,
    locale             varchar(10)  NOT NULL DEFAULT 'pl-PL',
    failed_login_count integer      NOT NULL DEFAULT 0,
    locked_until       timestamptz,
    mfa_enabled        boolean      NOT NULL DEFAULT false,
    last_login_at      timestamptz,
    terms_accepted_at  timestamptz,
    terms_version      varchar(20),
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now(),
    version            bigint       NOT NULL DEFAULT 0,
    CONSTRAINT users_email_uk UNIQUE (email),
    CONSTRAINT users_status_ck CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED')),
    CONSTRAINT users_platform_role_ck CHECK (platform_role IS NULL OR platform_role IN ('PLATFORM_ADMIN', 'PLATFORM_SUPPORT'))
);
CREATE INDEX users_created_at_idx ON users (created_at DESC);

CREATE TABLE user_sessions
(
    id                  uuid PRIMARY KEY,
    user_id             uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash          varchar(64)     NOT NULL,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    last_seen_at        timestamptz  NOT NULL DEFAULT now(),
    idle_expires_at     timestamptz  NOT NULL,
    absolute_expires_at timestamptz  NOT NULL,
    remember_me         boolean      NOT NULL DEFAULT false,
    mfa_verified        boolean      NOT NULL DEFAULT false,
    revoked_at          timestamptz,
    revoke_reason       varchar(50),
    ip_address          varchar(45),
    user_agent          varchar(512),
    CONSTRAINT user_sessions_token_hash_uk UNIQUE (token_hash)
);
CREATE INDEX user_sessions_user_active_idx ON user_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX user_sessions_expiry_idx ON user_sessions (absolute_expires_at);

CREATE TABLE user_tokens
(
    id          uuid PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose     varchar(30) NOT NULL,
    token_hash  varchar(64)    NOT NULL,
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_tokens_token_hash_uk UNIQUE (token_hash),
    CONSTRAINT user_tokens_purpose_ck CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET'))
);
CREATE INDEX user_tokens_user_purpose_idx ON user_tokens (user_id, purpose) WHERE consumed_at IS NULL;

CREATE TABLE user_mfa_totp
(
    user_id          uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    secret_encrypted varchar(512) NOT NULL,
    confirmed_at     timestamptz,
    last_used_step   bigint,
    created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE user_recovery_codes
(
    id        uuid PRIMARY KEY,
    user_id   uuid     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash varchar(64) NOT NULL,
    used_at   timestamptz
);
CREATE INDEX user_recovery_codes_user_idx ON user_recovery_codes (user_id);

CREATE TABLE user_oauth_identities
(
    id         uuid PRIMARY KEY,
    user_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider   varchar(30)  NOT NULL,
    subject    varchar(255) NOT NULL,
    email      citext       NOT NULL,
    created_at timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT user_oauth_identities_uk UNIQUE (provider, subject)
);
CREATE INDEX user_oauth_identities_user_idx ON user_oauth_identities (user_id);

-- ---------------------------------------------------------------------------------
-- Tenants & memberships
-- ---------------------------------------------------------------------------------
CREATE TABLE tenants
(
    id               uuid PRIMARY KEY,
    name             varchar(150) NOT NULL,
    status           varchar(20)  NOT NULL,
    suspended_reason varchar(500),
    created_by       uuid         NOT NULL REFERENCES users (id),
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    version          bigint       NOT NULL DEFAULT 0,
    CONSTRAINT tenants_status_ck CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))
);
CREATE INDEX tenants_created_by_idx ON tenants (created_by);
CREATE INDEX tenants_status_idx ON tenants (status);

CREATE TABLE tenant_memberships
(
    id         uuid PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       varchar(30) NOT NULL,
    status     varchar(20) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version    bigint      NOT NULL DEFAULT 0,
    CONSTRAINT tenant_memberships_uk UNIQUE (tenant_id, user_id),
    CONSTRAINT tenant_memberships_role_ck CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'PRODUCT_MANAGER', 'ORDER_MANAGER', 'CUSTOMER_SUPPORT')),
    CONSTRAINT tenant_memberships_status_ck CHECK (status IN ('ACTIVE', 'DISABLED'))
);
CREATE INDEX tenant_memberships_user_idx ON tenant_memberships (user_id);

ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_memberships_access ON tenant_memberships
    USING (app_bypass_rls() OR tenant_id = app_current_tenant() OR user_id = app_current_user())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

CREATE TABLE tenant_invitations
(
    id          uuid PRIMARY KEY,
    tenant_id   uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    email       citext      NOT NULL,
    role        varchar(30) NOT NULL,
    token_hash  varchar(64)    NOT NULL,
    invited_by  uuid        NOT NULL REFERENCES users (id),
    expires_at  timestamptz NOT NULL,
    accepted_at timestamptz,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_invitations_token_hash_uk UNIQUE (token_hash),
    CONSTRAINT tenant_invitations_role_ck CHECK (role IN ('ADMIN', 'MANAGER', 'PRODUCT_MANAGER', 'ORDER_MANAGER', 'CUSTOMER_SUPPORT'))
);
CREATE INDEX tenant_invitations_tenant_idx ON tenant_invitations (tenant_id);
CREATE UNIQUE INDEX tenant_invitations_pending_uk ON tenant_invitations (tenant_id, email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_invitations_isolation ON tenant_invitations
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

-- ---------------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------------
CREATE TABLE stores
(
    id               uuid PRIMARY KEY,
    tenant_id        uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name             varchar(150) NOT NULL,
    slug             varchar(63)  NOT NULL,
    status           varchar(20)  NOT NULL,
    default_locale   varchar(10)  NOT NULL DEFAULT 'pl-PL',
    default_currency varchar(3)      NOT NULL DEFAULT 'PLN',
    timezone         varchar(50)  NOT NULL DEFAULT 'Europe/Warsaw',
    contact_email    citext,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    version          bigint       NOT NULL DEFAULT 0,
    CONSTRAINT stores_tenant_uk UNIQUE (tenant_id),
    CONSTRAINT stores_slug_uk UNIQUE (slug),
    CONSTRAINT stores_status_ck CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUSPENDED'))
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY stores_isolation ON stores
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

CREATE TABLE store_settings
(
    id                  uuid PRIMARY KEY,
    tenant_id           uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    legal_company_name  varchar(255),
    tax_id              varchar(20),
    address_line1       varchar(200),
    address_line2       varchar(200),
    postal_code         varchar(20),
    city                varchar(100),
    country_code        varchar(2)     NOT NULL DEFAULT 'PL',
    phone               varchar(30),
    order_email         citext,
    prices_include_tax  boolean     NOT NULL DEFAULT true,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    version             bigint      NOT NULL DEFAULT 0,
    CONSTRAINT store_settings_tenant_uk UNIQUE (tenant_id)
);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_settings_isolation ON store_settings
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

-- ---------------------------------------------------------------------------------
-- Domains
-- ---------------------------------------------------------------------------------
CREATE TABLE store_domains
(
    id                   uuid PRIMARY KEY,
    tenant_id            uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    hostname             varchar(253) NOT NULL,
    type                 varchar(30)  NOT NULL,
    status               varchar(30)  NOT NULL,
    is_primary           boolean      NOT NULL DEFAULT false,
    verification_token   varchar(100),
    provider_hostname_id varchar(100),
    ssl_status           varchar(30),
    last_checked_at      timestamptz,
    created_at           timestamptz  NOT NULL DEFAULT now(),
    updated_at           timestamptz  NOT NULL DEFAULT now(),
    version              bigint       NOT NULL DEFAULT 0,
    CONSTRAINT store_domains_hostname_uk UNIQUE (hostname),
    CONSTRAINT store_domains_hostname_lower_ck CHECK (hostname = lower(hostname)),
    CONSTRAINT store_domains_type_ck CHECK (type IN ('PLATFORM_SUBDOMAIN', 'CUSTOM')),
    CONSTRAINT store_domains_status_ck CHECK (status IN ('PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'FAILED', 'REMOVED'))
);
CREATE INDEX store_domains_tenant_idx ON store_domains (tenant_id);
CREATE UNIQUE INDEX store_domains_primary_uk ON store_domains (tenant_id) WHERE is_primary;

ALTER TABLE store_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_domains_isolation ON store_domains
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

-- ---------------------------------------------------------------------------------
-- Audit log (append-only for the application role)
-- ---------------------------------------------------------------------------------
CREATE TABLE audit_logs
(
    id            uuid PRIMARY KEY,
    tenant_id     uuid REFERENCES tenants (id) ON DELETE CASCADE,
    actor_user_id uuid,
    actor_type    varchar(20)  NOT NULL,
    action        varchar(100) NOT NULL,
    target_type   varchar(50),
    target_id     varchar(100),
    ip_address    varchar(45),
    metadata      jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT audit_logs_actor_type_ck CHECK (actor_type IN ('USER', 'SYSTEM', 'PLATFORM_ADMIN', 'ANONYMOUS'))
);
CREATE INDEX audit_logs_tenant_created_idx ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
    USING (app_bypass_rls() OR (tenant_id IS NOT NULL AND tenant_id = app_current_tenant()));
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
    WITH CHECK (app_bypass_rls() OR tenant_id IS NULL OR tenant_id = app_current_tenant());

-- ---------------------------------------------------------------------------------
-- Infrastructure: Spring Modulith event publication registry (outbox) and ShedLock
-- ---------------------------------------------------------------------------------
CREATE TABLE event_publication
(
    id                     uuid PRIMARY KEY,
    listener_id            text        NOT NULL,
    event_type             text        NOT NULL,
    serialized_event       text        NOT NULL,
    publication_date       timestamptz NOT NULL,
    completion_date        timestamptz,
    status                 text,
    completion_attempts    integer,
    last_resubmission_date timestamptz
);
CREATE INDEX event_publication_serialized_event_hash_idx ON event_publication USING hash (serialized_event);
CREATE INDEX event_publication_by_completion_date_idx ON event_publication (completion_date);

CREATE TABLE shedlock
(
    name       varchar(64)  NOT NULL PRIMARY KEY,
    lock_until timestamp    NOT NULL,
    locked_at  timestamp    NOT NULL,
    locked_by  varchar(255) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole};
REVOKE UPDATE, DELETE ON audit_logs FROM ${appRole};
REVOKE ALL ON flyway_schema_history FROM ${appRole};

-- =====================================================================================
-- V7 — storefront: media assets (product images), theme configuration (draft/published),
-- store publication timestamp.
-- =====================================================================================

ALTER TABLE stores ADD COLUMN published_at timestamptz;

CREATE TABLE media_assets
(
    id           uuid PRIMARY KEY,
    tenant_id    uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    owner_type   varchar(20)  NOT NULL,
    owner_id     uuid         NOT NULL,
    storage_key  varchar(200) NOT NULL,
    content_type varchar(40)  NOT NULL,
    width        integer      NOT NULL,
    height       integer      NOT NULL,
    -- Original plus generated variants (counts towards the plan's storage limit).
    total_bytes  bigint       NOT NULL,
    alt          varchar(200),
    position     integer      NOT NULL DEFAULT 0,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT media_assets_owner_ck CHECK (owner_type IN ('PRODUCT')),
    CONSTRAINT media_assets_key_uk UNIQUE (storage_key)
);
CREATE INDEX media_assets_owner_idx ON media_assets (tenant_id, owner_type, owner_id, position);

CREATE TABLE store_themes
(
    tenant_id       uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    draft_json      text        NOT NULL,
    published_json  text,
    published_at    timestamptz,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         bigint      NOT NULL DEFAULT 0
);

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['media_assets', 'store_themes']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END
$$;

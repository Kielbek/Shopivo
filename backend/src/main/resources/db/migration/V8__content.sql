-- =====================================================================================
-- V8 — store content: CMS pages and blog posts (with immutable revisions of what was
-- published, so the exact terms a customer accepted can be shown later), SEO redirects,
-- and the terms revision accepted with each order.
-- =====================================================================================

CREATE TABLE content_entries
(
    id               uuid PRIMARY KEY,
    tenant_id        uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    kind             varchar(10)  NOT NULL,
    -- Legal documents the storefront links to (footer, checkout). At most one of each per store.
    system_key       varchar(20),
    slug             varchar(140) NOT NULL,
    title            varchar(200) NOT NULL,
    excerpt          varchar(300),
    body             text         NOT NULL DEFAULT '',
    status           varchar(10)  NOT NULL DEFAULT 'DRAFT',
    show_in_footer   boolean      NOT NULL DEFAULT false,
    seo_title        varchar(200),
    seo_description  varchar(320),
    published_at     timestamptz,
    published_revision integer    NOT NULL DEFAULT 0,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    version          bigint       NOT NULL DEFAULT 0,
    CONSTRAINT content_entries_kind_ck CHECK (kind IN ('PAGE', 'POST')),
    CONSTRAINT content_entries_status_ck CHECK (status IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT content_entries_system_ck CHECK (system_key IS NULL OR (kind = 'PAGE' AND system_key IN ('TERMS', 'PRIVACY', 'RETURNS', 'SHIPPING'))),
    CONSTRAINT content_entries_body_len_ck CHECK (length(body) <= 100000),
    CONSTRAINT content_entries_slug_uk UNIQUE (tenant_id, kind, slug)
);
CREATE UNIQUE INDEX content_entries_system_uk ON content_entries (tenant_id, system_key) WHERE system_key IS NOT NULL;
CREATE INDEX content_entries_list_idx ON content_entries (tenant_id, kind, status, published_at DESC);

-- Snapshot taken on every publication. Rows are never updated.
CREATE TABLE content_revisions
(
    id           uuid PRIMARY KEY,
    tenant_id    uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    entry_id     uuid         NOT NULL,
    revision     integer      NOT NULL,
    title        varchar(200) NOT NULL,
    body         text         NOT NULL,
    published_at timestamptz  NOT NULL DEFAULT now(),
    published_by uuid,
    CONSTRAINT content_revisions_uk UNIQUE (entry_id, revision)
);
CREATE INDEX content_revisions_tenant_idx ON content_revisions (tenant_id, entry_id);

CREATE TABLE seo_redirects
(
    id         uuid PRIMARY KEY,
    tenant_id  uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    from_path  varchar(300) NOT NULL,
    to_path    varchar(300) NOT NULL,
    automatic  boolean      NOT NULL DEFAULT false,
    created_at timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT seo_redirects_from_uk UNIQUE (tenant_id, from_path),
    CONSTRAINT seo_redirects_paths_ck CHECK (from_path LIKE '/%' AND to_path LIKE '/%' AND from_path <> to_path)
);

-- Which published revision of the terms the customer accepted.
ALTER TABLE orders ADD COLUMN terms_revision_id uuid;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['content_entries', 'content_revisions', 'seo_redirects']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END
$$;

-- Revisions are append-only for the application.
REVOKE UPDATE ON content_revisions FROM ${appRole};

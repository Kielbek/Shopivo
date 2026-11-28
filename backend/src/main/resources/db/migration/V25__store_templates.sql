-- Store customisation of a template package (engine v2): which sections each page has, their order and settings.
-- The document is validated against the template's section schemas on save; template defaults fill in what is missing.
CREATE TABLE store_templates
(
    tenant_id      uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    template_code  varchar(40) NOT NULL,
    draft_json     text        NOT NULL,
    published_json text,
    published_at   timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    version        bigint      NOT NULL DEFAULT 0
);

-- Every publication is kept, so the merchant can go back to an earlier look.
CREATE TABLE store_template_versions
(
    id            uuid PRIMARY KEY,
    tenant_id     uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    template_code varchar(40) NOT NULL,
    doc_json      text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid
);
CREATE INDEX store_template_versions_tenant ON store_template_versions (tenant_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['store_templates', 'store_template_versions']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END $$;

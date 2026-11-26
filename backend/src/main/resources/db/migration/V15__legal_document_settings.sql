-- Store-specific facts used by the legal document templates (besides the company data in store_settings).
CREATE TABLE store_legal_settings (
    tenant_id        uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    shipping_time    varchar(200),
    effective_date   date,
    returns_address  varchar(400),
    analytics_tools  varchar(300),
    marketing_tools  varchar(300),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    version          bigint NOT NULL DEFAULT 0
);

ALTER TABLE store_legal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_legal_settings_isolation ON store_legal_settings
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

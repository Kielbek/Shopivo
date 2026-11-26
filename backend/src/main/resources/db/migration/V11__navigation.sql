-- =====================================================================================
-- V11 — header menu of a store. Items are store-relative paths only (validated by the app).
-- No row = the storefront shows the default menu (top-level categories).
-- =====================================================================================

CREATE TABLE store_navigation
(
    tenant_id  uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    items_json text        NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    version    bigint      NOT NULL DEFAULT 0
);

ALTER TABLE store_navigation ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_navigation_isolation ON store_navigation USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

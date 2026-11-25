-- =====================================================================================
-- V2 — security hardening after review.
-- tenant_memberships: a user may READ their own memberships in every tenant (store list),
-- but INSERT/UPDATE/DELETE are restricted to the tenant bound to the current context.
-- Previously the shared USING clause also allowed DELETE of one's own membership in a
-- foreign tenant when no tenant context was bound.
-- =====================================================================================

DROP POLICY tenant_memberships_access ON tenant_memberships;

CREATE POLICY tenant_memberships_select ON tenant_memberships FOR SELECT
    USING (app_bypass_rls() OR tenant_id = app_current_tenant() OR user_id = app_current_user());

CREATE POLICY tenant_memberships_insert ON tenant_memberships FOR INSERT
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

CREATE POLICY tenant_memberships_update ON tenant_memberships FOR UPDATE
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

CREATE POLICY tenant_memberships_delete ON tenant_memberships FOR DELETE
    USING (app_bypass_rls() OR tenant_id = app_current_tenant());

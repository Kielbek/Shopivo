-- Sign-in with Google for a store's customers. Each store uses its own OAuth client (created by the merchant in Google
-- Cloud). The client secret is stored encrypted (AES-256-GCM, bound to the store) and never returned by the API.
CREATE TABLE store_google_sign_in
(
    tenant_id            uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    client_id            varchar(200) NOT NULL,
    client_secret_enc    text         NOT NULL,
    enabled              boolean      NOT NULL DEFAULT false,
    updated_at           timestamptz  NOT NULL DEFAULT now(),
    updated_by           uuid,
    version              bigint       NOT NULL DEFAULT 0
);

-- One sign-in attempt: random state (stored hashed), PKCE verifier and nonce; single use, valid for 10 minutes.
CREATE TABLE customer_oauth_states
(
    state_hash     varchar(64) PRIMARY KEY,
    tenant_id      uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    code_verifier  varchar(128) NOT NULL,
    nonce          varchar(64)  NOT NULL,
    redirect_uri   varchar(400) NOT NULL,
    return_path    varchar(300) NOT NULL,
    expires_at     timestamptz  NOT NULL,
    created_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX customer_oauth_states_expiry ON customer_oauth_states (expires_at);

-- The Google account (subject) a customer account is linked to; one per store.
ALTER TABLE customer_accounts ADD COLUMN google_sub varchar(255);
CREATE UNIQUE INDEX customer_accounts_google_sub_uk ON customer_accounts (tenant_id, google_sub) WHERE google_sub IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['store_google_sign_in', 'customer_oauth_states']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END $$;

-- Newsletter subscribers of a store, with double opt-in: a subscription becomes CONFIRMED only through the link sent
-- to the address (proof of consent: confirmed_at + consent_text). Tokens are stored hashed.
CREATE TABLE newsletter_subscribers (
    id                 uuid PRIMARY KEY,
    tenant_id          uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    email              varchar(320) NOT NULL,
    status             varchar(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'UNSUBSCRIBED')),
    confirm_token_hash varchar(64),
    confirm_sent_at    timestamptz,
    unsubscribe_token_hash varchar(64),
    consent_text       varchar(500),
    source             varchar(40) NOT NULL DEFAULT 'storefront',
    created_at         timestamptz NOT NULL DEFAULT now(),
    confirmed_at       timestamptz,
    unsubscribed_at    timestamptz,
    CONSTRAINT newsletter_subscribers_email_uq UNIQUE (tenant_id, email)
);
CREATE INDEX newsletter_subscribers_status_idx ON newsletter_subscribers (tenant_id, status, created_at DESC);
CREATE INDEX newsletter_confirm_token_idx ON newsletter_subscribers (confirm_token_hash) WHERE confirm_token_hash IS NOT NULL;
CREATE INDEX newsletter_unsubscribe_token_idx ON newsletter_subscribers (unsubscribe_token_hash) WHERE unsubscribe_token_hash IS NOT NULL;

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY newsletter_subscribers_isolation ON newsletter_subscribers
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

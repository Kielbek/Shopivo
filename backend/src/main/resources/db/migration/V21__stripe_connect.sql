-- =====================================================================================
-- V21 — Stripe Connect: the store's connected account id (acct_…) in plain text. Stripe sends
-- every connected account's events to one platform webhook; the account id finds the store.
-- It is an identifier, not a secret (only the platform key authenticates).
-- =====================================================================================

ALTER TABLE store_payment_providers ADD COLUMN external_account_id varchar(100);
CREATE UNIQUE INDEX store_payment_providers_external_uk
    ON store_payment_providers (provider_id, external_account_id) WHERE external_account_id IS NOT NULL;

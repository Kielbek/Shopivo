-- =====================================================================================
-- V19 — customer profile managed in the panel: default address, tags and the source of
-- the marketing consent (RODO accountability: where did the consent come from).
-- The table already has RLS (V5); new columns inherit it.
-- =====================================================================================

ALTER TABLE customers
    ADD COLUMN company                  varchar(200),
    ADD COLUMN address_line1            varchar(200),
    ADD COLUMN address_line2            varchar(200),
    ADD COLUMN postal_code              varchar(20),
    ADD COLUMN city                     varchar(100),
    ADD COLUMN country_code             char(2),
    ADD COLUMN tags                     text[]      NOT NULL DEFAULT '{}',
    ADD COLUMN marketing_consent_source varchar(20),
    ADD CONSTRAINT customers_consent_source_ck
        CHECK (marketing_consent_source IS NULL OR marketing_consent_source IN ('CHECKOUT', 'PANEL', 'IMPORT')),
    ADD CONSTRAINT customers_tags_ck CHECK (cardinality(tags) <= 20);

CREATE INDEX customers_tags_idx ON customers USING gin (tags);

-- Existing consents were all given at checkout.
UPDATE customers SET marketing_consent_source = 'CHECKOUT' WHERE accepts_marketing;

-- Default address = shipping address of the customer's most recent order.
UPDATE customers c
SET company       = nullif(a.addr ->> 'company', ''),
    address_line1 = nullif(a.addr ->> 'line1', ''),
    address_line2 = nullif(a.addr ->> 'line2', ''),
    postal_code   = nullif(a.addr ->> 'postalCode', ''),
    city          = nullif(a.addr ->> 'city', ''),
    country_code  = upper(nullif(a.addr ->> 'countryCode', ''))
FROM (SELECT DISTINCT ON (customer_id) customer_id, shipping_address_json::jsonb AS addr
      FROM orders
      WHERE customer_id IS NOT NULL AND shipping_address_json IS NOT NULL
      ORDER BY customer_id, created_at DESC) a
WHERE a.customer_id = c.id
  AND length(coalesce(a.addr ->> 'countryCode', '')) = 2;

-- =====================================================================================
-- V22 — courier aggregators (Furgonetka, Apaczka): the services the store ticked on its
-- account (snapshot: id, name, courier code, delivery kinds). A shipping method links to
-- "<account>:<service>", e.g. "furgonetka:12345", so carrier references get longer.
-- =====================================================================================

ALTER TABLE store_carrier_accounts ADD COLUMN services_json text NOT NULL DEFAULT '[]';
ALTER TABLE shipping_methods ALTER COLUMN carrier TYPE varchar(80);
ALTER TABLE orders ALTER COLUMN shipping_carrier TYPE varchar(80);

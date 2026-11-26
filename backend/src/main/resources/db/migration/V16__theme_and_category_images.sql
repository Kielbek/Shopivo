-- Images for the storefront theme (store-wide library, owner = the tenant) and one picture per category.
ALTER TABLE media_assets DROP CONSTRAINT media_assets_owner_ck;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_owner_ck CHECK (owner_type IN ('PRODUCT', 'THEME', 'CATEGORY'));

-- =====================================================================================
-- V20 — a store can sell in several industries (e.g. clothes, shoes and perfumes).
-- `industry` stays the primary one (first chosen); the rest are kept in order here.
-- Suggestions in the panel (variant presets, starter categories) combine all of them.
-- =====================================================================================

ALTER TABLE stores
    ADD COLUMN additional_industries varchar(40)[] NOT NULL DEFAULT '{}',
    ADD CONSTRAINT stores_additional_industries_ck CHECK (
        cardinality(additional_industries) <= 4
        AND (industry IS NOT NULL OR cardinality(additional_industries) = 0)
        AND additional_industries <@ ARRAY[
            'FASHION', 'FOOTWEAR', 'ELECTRONICS', 'COMPUTERS', 'FURNITURE', 'HOME', 'GARDEN', 'COSMETICS', 'PERFUMES',
            'JEWELLER', 'SPORTS', 'AUTOMOTIVE', 'PETS', 'TOYS', 'KIDS', 'GROCERY', 'HOUSEHOLD', 'BUILDING', 'TOOLS',
            'STATIONERY', 'BOOKS', 'MUSIC', 'GAMES', 'HOBBY', 'HANDMADE', 'GIFTS', 'JEWELRY', 'ACCESSORIES', 'MEDICAL',
            'ECO', 'DIGITAL', 'FOOD', 'OFFICE', 'OUTDOOR', 'GENERAL']::varchar(40)[]);

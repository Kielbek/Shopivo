-- Store industry (branża): chosen at creation or in settings; drives suggestions in the panel (variant presets,
-- starter categories). NULL = not chosen yet.
ALTER TABLE stores ADD COLUMN industry varchar(40);
ALTER TABLE stores ADD CONSTRAINT stores_industry_check CHECK (industry IS NULL OR industry IN (
    'FASHION', 'FOOTWEAR', 'ELECTRONICS', 'COMPUTERS', 'FURNITURE', 'HOME', 'GARDEN', 'COSMETICS', 'PERFUMES',
    'JEWELLER', 'SPORTS', 'AUTOMOTIVE', 'PETS', 'TOYS', 'KIDS', 'GROCERY', 'HOUSEHOLD', 'BUILDING', 'TOOLS',
    'STATIONERY', 'BOOKS', 'MUSIC', 'GAMES', 'HOBBY', 'HANDMADE', 'GIFTS', 'JEWELRY', 'ACCESSORIES', 'MEDICAL',
    'ECO', 'DIGITAL', 'FOOD', 'OFFICE', 'OUTDOOR', 'GENERAL'));

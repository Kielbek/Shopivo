package pl.shopivo.stores;

/**
 * The store's industry (branża). Only steers suggestions in the panel (variant presets, starter categories, default
 * product type) — it never restricts what a store may sell. Labels live in the frontend; the database checks the codes.
 */
public enum StoreIndustry {
    FASHION, FOOTWEAR, ELECTRONICS, COMPUTERS, FURNITURE, HOME, GARDEN, COSMETICS, PERFUMES, JEWELLER, SPORTS, AUTOMOTIVE,
    PETS, TOYS, KIDS, GROCERY, HOUSEHOLD, BUILDING, TOOLS, STATIONERY, BOOKS, MUSIC, GAMES, HOBBY, HANDMADE, GIFTS, JEWELRY,
    ACCESSORIES, MEDICAL, ECO, DIGITAL, FOOD, OFFICE, OUTDOOR, GENERAL
}

package pl.shopivo.stores;

/**
 * The store's industry (branża). Only steers suggestions in the panel (variant presets, starter categories, default
 * product type) — it never restricts what a store may sell. Labels live in the frontend; the database checks the codes.
 */
public enum StoreIndustry {
    FASHION, FOOTWEAR, ELECTRONICS, COMPUTERS, FURNITURE, HOME, GARDEN, COSMETICS, PERFUMES, JEWELLER, SPORTS, AUTOMOTIVE,
    PETS, TOYS, KIDS, GROCERY, HOUSEHOLD, BUILDING, TOOLS, STATIONERY, BOOKS, MUSIC, GAMES, HOBBY, HANDMADE, GIFTS, JEWELRY,
    ACCESSORIES, MEDICAL, ECO, DIGITAL, FOOD, OFFICE, OUTDOOR, GENERAL;

    /** Most industries one store can choose. */
    public static final int MAX_PER_STORE = 5;

    /**
     * Normalises a choice: {@code industries} wins over the legacy single {@code industry}; duplicates removed, order
     * kept (first = primary); "Wielobranżowy" alone only — with other industries it adds nothing and is dropped.
     */
    public static java.util.List<StoreIndustry> normalize(java.util.List<StoreIndustry> industries, StoreIndustry legacy) {
        java.util.List<StoreIndustry> in = industries != null ? industries : legacy == null ? java.util.List.of() : java.util.List.of(legacy);
        java.util.LinkedHashSet<StoreIndustry> out = new java.util.LinkedHashSet<>();
        for (StoreIndustry i : in) if (i != null) out.add(i);
        if (out.size() > 1) out.remove(GENERAL);
        if (out.size() > MAX_PER_STORE) {
            throw new pl.shopivo.shared.error.BusinessRuleException("TOO_MANY_INDUSTRIES",
                    "Wybierz najwyżej " + MAX_PER_STORE + " branż — pozostałe produkty i tak możesz sprzedawać.");
        }
        return java.util.List.copyOf(out);
    }
}

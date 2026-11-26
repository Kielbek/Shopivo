package pl.shopivo.content;

/** Legal documents of a store. TERMS and PRIVACY must be published before the store can be. */
public enum LegalKey {
    TERMS("Regulamin sklepu", "regulamin", true),
    PRIVACY("Polityka prywatności", "polityka-prywatnosci", true),
    RETURNS("Zwroty i reklamacje", "zwroty-i-reklamacje", false),
    SHIPPING("Dostawa i płatności", "dostawa-i-platnosci", false);

    private final String title;
    private final String slug;
    private final boolean requiredForPublish;

    LegalKey(String title, String slug, boolean requiredForPublish) {
        this.title = title;
        this.slug = slug;
        this.requiredForPublish = requiredForPublish;
    }

    public String title() {
        return title;
    }

    public String slug() {
        return slug;
    }

    public boolean requiredForPublish() {
        return requiredForPublish;
    }
}

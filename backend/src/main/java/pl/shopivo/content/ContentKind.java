package pl.shopivo.content;

public enum ContentKind {
    /** Page at /strona/{slug}. */
    PAGE,
    /** Blog post at /blog/{slug}. */
    POST;

    public String pathPrefix() {
        return this == PAGE ? "/strona/" : "/blog/";
    }
}

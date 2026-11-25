package pl.shopivo.stores;

public record StoreSettingsView(
        String legalCompanyName,
        String taxId,
        String addressLine1,
        String addressLine2,
        String postalCode,
        String city,
        String countryCode,
        String phone,
        String orderEmail,
        boolean pricesIncludeTax,
        long version) {
}

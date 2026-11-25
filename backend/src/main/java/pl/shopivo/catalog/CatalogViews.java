package pl.shopivo.catalog;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Read models of the catalogue (API). Amounts in minor units (grosze), prices as entered by the merchant (gross). */
public final class CatalogViews {

    private CatalogViews() {
    }

    public record CategoryView(UUID id, UUID parentId, String name, String slug, String description, int position, int depth,
            boolean visible, String seoTitle, String seoDescription, long productCount, long version) {
    }

    public record CategoryRef(UUID id, String name) {
    }

    public record BrandView(UUID id, String name, String slug, long productCount) {
    }

    public record OptionView(String name, List<String> values) {
    }

    public record VariantView(UUID id, Map<String, String> optionValues, String title, String sku, String ean, long priceMinor,
            Long compareAtMinor, Long costMinor, String currency, Long lowestPrice30dMinor, Integer weightGrams,
            Integer lengthMm, Integer widthMm, Integer heightMm, boolean trackInventory, boolean allowBackorder,
            Integer onHand, Integer reserved, Integer available) {
    }

    public record ProductView(UUID id, String name, String slug, String description, ProductStatus status, ProductType type,
            BrandView brand, int vatRateBps, List<CategoryRef> categories, String seoTitle, String seoDescription,
            List<OptionView> options, List<VariantView> variants, Instant publishedAt, Instant createdAt,
            Instant updatedAt, long version) {
    }

    public record ProductRow(UUID id, String name, String slug, ProductStatus status, ProductType type, int variantCount,
            String sku, long minPriceMinor, long maxPriceMinor, String currency, Integer stock, boolean lowStock,
            List<String> categories, Instant updatedAt) {
    }

    public record InventoryRow(UUID variantId, UUID productId, String productName, String variantTitle, String sku,
            ProductStatus productStatus, int onHand, int reserved, int available, int lowStockThreshold, boolean low,
            Instant updatedAt) {
    }

    public record MovementView(UUID id, int delta, int onHandAfter, MovementReason reason, String note, String reference,
            String actorName, Instant createdAt) {
    }

    public record CatalogStats(long products, long activeProducts, long draftProducts, long lowStockVariants,
            long outOfStockVariants) {
    }
}

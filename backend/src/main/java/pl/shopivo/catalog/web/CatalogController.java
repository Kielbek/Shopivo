package pl.shopivo.catalog.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.catalog.Brands;
import pl.shopivo.catalog.CatalogViews.BrandView;
import pl.shopivo.catalog.CatalogViews.CatalogStats;
import pl.shopivo.catalog.CatalogViews.CategoryView;
import pl.shopivo.catalog.CatalogViews.InventoryRow;
import pl.shopivo.catalog.CatalogViews.MovementView;
import pl.shopivo.catalog.CatalogViews.ProductRow;
import pl.shopivo.catalog.CatalogViews.ProductView;
import pl.shopivo.catalog.Categories;
import pl.shopivo.catalog.Inventory;
import pl.shopivo.catalog.MovementReason;
import pl.shopivo.catalog.ProductStatus;
import pl.shopivo.catalog.Products;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.web.PageResponse;

/** Catalogue of a store. The tenant comes from the verified membership (TenantAccessFilter), never from the body. */
@RestController
@RequestMapping("/api/v1/tenants/{tenantId}")
@Tag(name = "Catalogue")
class CatalogController {

    private final Products products;
    private final Categories categories;
    private final Brands brands;
    private final Inventory inventory;

    CatalogController(Products products, Categories categories, Brands brands, Inventory inventory) {
        this.products = products;
        this.categories = categories;
        this.brands = brands;
        this.inventory = inventory;
    }

    record BulkRequest(@NotNull @Size(min = 1, max = 200) List<UUID> ids, @NotNull Products.BulkAction action) {
    }

    record BrandRequest(@NotBlank @Size(max = 120) String name) {
    }

    record AdjustRequest(@NotNull Inventory.Mode mode, int quantity, @NotNull MovementReason reason, @Size(max = 300) String note) {
    }

    record ThresholdRequest(@Min(0) @Max(1_000_000) int threshold) {
    }

    // ---------------------------------------------------------------- products

    @GetMapping("/products")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    PageResponse<ProductRow> products(@PathVariable UUID tenantId, @RequestParam(required = false) String q,
            @RequestParam(required = false) ProductStatus status, @RequestParam(required = false) UUID categoryId,
            @RequestParam(defaultValue = "false") boolean lowStock, @RequestParam(required = false) Products.Sort sort,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(products.search(q, status, categoryId, lowStock, sort,
                PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))), r -> r);
    }

    @GetMapping("/products/stats")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    CatalogStats stats(@PathVariable UUID tenantId) {
        return products.stats();
    }

    @GetMapping("/products/{id}")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    ProductView product(@PathVariable UUID tenantId, @PathVariable UUID id) {
        return products.get(id);
    }

    @PostMapping("/products")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    ProductView create(@PathVariable UUID tenantId, @RequestBody Products.ProductInput input) {
        return products.create(input);
    }

    @PutMapping("/products/{id}")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    ProductView update(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody Products.ProductInput input) {
        return products.update(id, input);
    }

    @PostMapping("/products/{id}/duplicate")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    ProductView duplicate(@PathVariable UUID tenantId, @PathVariable UUID id) {
        return products.duplicate(id);
    }

    @DeleteMapping("/products/{id}")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID tenantId, @PathVariable UUID id) {
        products.delete(id);
    }

    @PostMapping("/products/bulk")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    Map<String, Integer> bulk(@PathVariable UUID tenantId, @Valid @RequestBody BulkRequest request) {
        return Map.of("affected", products.bulk(request.ids(), request.action()));
    }

    @GetMapping("/products/export.csv")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    ResponseEntity<byte[]> export(@PathVariable UUID tenantId) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("produkty-" + LocalDate.now() + ".csv").build().toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(products.exportCsv().getBytes(StandardCharsets.UTF_8));
    }

    record ImagesRequest(List<UUID> order, Map<UUID, String> alts) {
    }

    @PostMapping(path = "/products/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    pl.shopivo.media.Media.ImageView uploadImage(@PathVariable UUID tenantId, @PathVariable UUID id,
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            @RequestParam(value = "alt", required = false) String alt) throws java.io.IOException {
        if (file.getSize() > pl.shopivo.media.ImageProcessor.MAX_BYTES) {
            throw new pl.shopivo.shared.error.BusinessRuleException("FILE_TOO_LARGE", "Zdjęcie może mieć najwyżej 10 MB.");
        }
        return products.addImage(id, file.getBytes(), alt);
    }

    @PutMapping("/products/{id}/images")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    List<pl.shopivo.media.Media.ImageView> updateImages(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody ImagesRequest request) {
        return products.updateImages(id, request.order(), request.alts());
    }

    @DeleteMapping("/products/{id}/images/{imageId}")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteImage(@PathVariable UUID tenantId, @PathVariable UUID id, @PathVariable UUID imageId) {
        products.deleteImage(id, imageId);
    }

    // ---------------------------------------------------------------- categories & brands

    @GetMapping("/categories")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    List<CategoryView> categories(@PathVariable UUID tenantId) {
        return categories.list();
    }

    @PostMapping("/categories")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    CategoryView createCategory(@PathVariable UUID tenantId, @RequestBody Categories.CategoryInput input) {
        return categories.create(input);
    }

    @PutMapping("/categories/{id}")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    CategoryView updateCategory(@PathVariable UUID tenantId, @PathVariable UUID id, @RequestBody Categories.CategoryInput input) {
        return categories.update(id, input);
    }

    @DeleteMapping("/categories/{id}")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteCategory(@PathVariable UUID tenantId, @PathVariable UUID id) {
        categories.delete(id);
    }

    @GetMapping("/brands")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    List<BrandView> brands(@PathVariable UUID tenantId) {
        return brands.list();
    }

    @PostMapping("/brands")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.CREATED)
    BrandView createBrand(@PathVariable UUID tenantId, @Valid @RequestBody BrandRequest request) {
        return brands.create(request.name());
    }

    @DeleteMapping("/brands/{id}")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteBrand(@PathVariable UUID tenantId, @PathVariable UUID id) {
        brands.delete(id);
    }

    // ---------------------------------------------------------------- inventory

    @GetMapping("/inventory")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    PageResponse<InventoryRow> inventory(@PathVariable UUID tenantId, @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean lowStock, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return PageResponse.of(inventory.list(q, lowStock, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))), r -> r);
    }

    @PostMapping("/inventory/{variantId}/adjust")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    Inventory.StockLevel adjust(@PathVariable UUID tenantId, @PathVariable UUID variantId, @Valid @RequestBody AdjustRequest request) {
        return inventory.adjust(variantId, request.mode(), request.quantity(), request.reason(), request.note(),
                SecurityUtils.requireUser().id());
    }

    @PutMapping("/inventory/{variantId}/threshold")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_WRITE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void threshold(@PathVariable UUID tenantId, @PathVariable UUID variantId, @Valid @RequestBody ThresholdRequest request) {
        inventory.setThreshold(variantId, request.threshold());
    }

    @GetMapping("/inventory/{variantId}/movements")
    @PreAuthorize("@tenantAccess.can('PRODUCTS_READ')")
    List<MovementView> movements(@PathVariable UUID tenantId, @PathVariable UUID variantId) {
        return inventory.movements(variantId, 100);
    }
}

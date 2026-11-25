package pl.shopivo.catalog;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.catalog.CatalogViews.CategoryRef;
import pl.shopivo.catalog.CatalogViews.CatalogStats;
import pl.shopivo.catalog.CatalogViews.OptionView;
import pl.shopivo.catalog.CatalogViews.ProductRow;
import pl.shopivo.catalog.CatalogViews.ProductView;
import pl.shopivo.catalog.CatalogViews.VariantView;
import pl.shopivo.catalog.internal.CategoryEntity;
import pl.shopivo.catalog.internal.ProductEntity;
import pl.shopivo.catalog.internal.ProductRepository;
import pl.shopivo.catalog.internal.VariantEntity;
import pl.shopivo.catalog.internal.VariantRepository;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.web.Slugs;
import pl.shopivo.stores.Stores;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Products of the current store with their options and variants. */
@Service
public class Products {

    static final int MAX_OPTIONS = 3;
    static final int MAX_VALUES = 50;
    static final int MAX_VARIANTS = 100;
    static final long MAX_PRICE = 100_000_000_00L;
    static final Set<Integer> VAT_RATES = Set.of(0, 500, 800, 2300);

    private final ProductRepository products;
    private final VariantRepository variants;
    private final Categories categories;
    private final Brands brands;
    private final Inventory inventory;
    private final PriceHistory prices;
    private final Stores stores;
    private final List<ProductLimitPolicy> limits;
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final AuditLog auditLog;

    Products(ProductRepository products, VariantRepository variants, Categories categories, Brands brands, Inventory inventory,
            PriceHistory prices, Stores stores, List<ProductLimitPolicy> limits, JdbcTemplate jdbc, JsonMapper json, AuditLog auditLog) {
        this.products = products;
        this.variants = variants;
        this.categories = categories;
        this.brands = brands;
        this.inventory = inventory;
        this.prices = prices;
        this.stores = stores;
        this.limits = limits;
        this.jdbc = jdbc;
        this.json = json;
        this.auditLog = auditLog;
    }

    public record OptionInput(String name, List<String> values) {
    }

    public record VariantInput(UUID id, Map<String, String> optionValues, String sku, String ean, long priceMinor,
            Long compareAtMinor, Long costMinor, Integer weightGrams, Integer lengthMm, Integer widthMm, Integer heightMm,
            boolean trackInventory, boolean allowBackorder, Integer initialStock) {
    }

    public record ProductInput(String name, String slug, String description, ProductStatus status, ProductType type,
            UUID brandId, Integer vatRateBps, List<UUID> categoryIds, String seoTitle, String seoDescription,
            List<OptionInput> options, List<VariantInput> variants, long version) {
    }

    public enum BulkAction { ACTIVATE, DRAFT, ARCHIVE, DELETE }

    public enum Sort { UPDATED, NAME, PRICE, STOCK }

    // ------------------------------------------------------------------------------------------------ queries

    @Transactional(readOnly = true)
    public ProductView get(UUID id) {
        ProductEntity p = products.findById(id).orElseThrow(() -> new NotFoundException("Nie znaleziono produktu."));
        return view(p);
    }

    @Transactional(readOnly = true)
    public Page<ProductRow> search(String query, ProductStatus status, UUID categoryId, boolean lowStock, Sort sort, Pageable pageable) {
        UUID tenant = TenantContext.requireTenantId();
        StringBuilder where = new StringBuilder(" where p.tenant_id = ?");
        List<Object> args = new ArrayList<>(List.of(tenant));
        if (status != null) {
            where.append(" and p.status = ?");
            args.add(status.name());
        } else {
            where.append(" and p.status <> 'ARCHIVED'");
        }
        if (query != null && !query.isBlank()) {
            String like = "%" + query.trim().toLowerCase().replace("%", "\\%").replace("_", "\\_") + "%";
            where.append(" and (lower(p.name) like ? or exists (select 1 from product_variants sv where sv.product_id = p.id and (lower(sv.sku) like ? or sv.ean = ?)))");
            args.add(like);
            args.add(like);
            args.add(query.trim());
        }
        if (categoryId != null) {
            // Includes products of sub-categories.
            where.append(" and exists (select 1 from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = p.id and c.path like (select path from categories where id = ?) || '%')");
            args.add(categoryId);
        }
        String agg = """
                 from products p
                 left join lateral (select count(*) as variant_count, min(v.price_minor) as min_price, max(v.price_minor) as max_price,
                        min(v.currency) as currency, (array_agg(v.sku order by v.position))[1] as sku,
                        sum(i.on_hand - i.reserved) as stock, bool_or(i.on_hand - i.reserved <= i.low_stock_threshold) as low
                        from product_variants v left join inventory_items i on i.variant_id = v.id where v.product_id = p.id) a on true
                """;
        if (lowStock) where.append(" and a.low");
        Long total = jdbc.queryForObject("select count(*)" + agg + where, Long.class, args.toArray());
        String order = switch (sort == null ? Sort.UPDATED : sort) {
            case NAME -> "lower(p.name) asc";
            case PRICE -> "a.min_price asc nulls last";
            case STOCK -> "a.stock asc nulls last";
            case UPDATED -> "p.updated_at desc";
        };
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        List<ProductRow> rows = jdbc.query("""
                select p.id, p.name, p.slug, p.status, p.type, p.updated_at, a.*,
                       (select string_agg(c.name, '|' order by c.name) from product_categories pc join categories c on c.id = pc.category_id
                        where pc.product_id = p.id) as category_names
                """ + agg + where + " order by " + order + ", p.id limit ? offset ?", (rs, i) -> {
                    Object stock = rs.getObject("stock");
                    String cats = rs.getString("category_names");
                    return new ProductRow(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("slug"),
                            ProductStatus.valueOf(rs.getString("status")), ProductType.valueOf(rs.getString("type")),
                            rs.getInt("variant_count"), rs.getString("sku"), rs.getLong("min_price"), rs.getLong("max_price"),
                            rs.getString("currency"), stock == null ? null : ((Number) stock).intValue(), rs.getBoolean("low"),
                            cats == null ? List.of() : List.of(cats.split("\\|")), rs.getTimestamp("updated_at").toInstant());
                }, pageArgs.toArray());
        return new PageImpl<>(rows, pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public CatalogStats stats() {
        UUID tenant = TenantContext.requireTenantId();
        return jdbc.queryForObject("""
                select count(*) filter (where status <> 'ARCHIVED'), count(*) filter (where status = 'ACTIVE'),
                       count(*) filter (where status = 'DRAFT'),
                       (select count(*) from inventory_items i where i.tenant_id = ? and i.on_hand - i.reserved <= i.low_stock_threshold and i.on_hand - i.reserved > 0),
                       (select count(*) from inventory_items i where i.tenant_id = ? and i.on_hand - i.reserved <= 0)
                from products where tenant_id = ?
                """, (rs, i) -> new CatalogStats(rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getLong(4), rs.getLong(5)),
                tenant, tenant, tenant);
    }

    // ------------------------------------------------------------------------------------------------ commands

    @Transactional
    public ProductView create(ProductInput in) {
        UUID tenant = TenantContext.requireTenantId();
        ProductStatus status = in.status() == null ? ProductStatus.DRAFT : in.status();
        if (status != ProductStatus.ARCHIVED) {
            long count = products.countByStatusNot(ProductStatus.ARCHIVED);
            limits.forEach(l -> l.checkCanAddProduct(tenant, count));
        }
        String name = requireName(in.name());
        String slug = uniqueSlug(in.slug() == null || in.slug().isBlank() ? name : in.slug(), null, in.slug() != null && !in.slug().isBlank());
        ProductEntity p = new ProductEntity(name, slug);
        // Flushed now: variants reference the product by a plain FK column, which insert ordering does not see.
        products.saveAndFlush(p);
        apply(p, in, name, slug);
        p.changeStatus(status);
        auditLog.record(AuditEntry.tenant("catalog.product.created", tenant, "product", p.getId()).with(Map.of("name", name)));
        products.flush();
        return view(p);
    }

    @Transactional
    public ProductView update(UUID id, ProductInput in) {
        ProductEntity p = products.findById(id).orElseThrow(() -> new NotFoundException("Nie znaleziono produktu."));
        if (p.getVersion() != in.version()) {
            throw new ConflictException("VERSION_CONFLICT", "Produkt został w międzyczasie zmieniony. Odśwież stronę.");
        }
        String name = requireName(in.name());
        String slug = in.slug() == null || in.slug().isBlank() ? p.getSlug() : uniqueSlug(in.slug(), id, true);
        ProductStatus status = in.status() == null ? p.getStatus() : in.status();
        if (p.getStatus() == ProductStatus.ARCHIVED && status != ProductStatus.ARCHIVED) {
            UUID tenant = TenantContext.requireTenantId();
            long count = products.countByStatusNot(ProductStatus.ARCHIVED);
            limits.forEach(l -> l.checkCanAddProduct(tenant, count));
        }
        apply(p, in, name, slug);
        p.changeStatus(status);
        p.markEdited();
        auditLog.record(AuditEntry.tenant("catalog.product.updated", TenantContext.requireTenantId(), "product", id));
        products.flush();
        return view(p);
    }

    @Transactional
    public int bulk(List<UUID> ids, BulkAction action) {
        if (ids == null || ids.isEmpty()) return 0;
        if (ids.size() > 200) throw new BusinessRuleException("TOO_MANY", "Jednorazowo można zmienić najwyżej 200 produktów.");
        List<ProductEntity> found = products.findByIdIn(ids);
        UUID tenant = TenantContext.requireTenantId();
        if (action == BulkAction.ACTIVATE || action == BulkAction.DRAFT) {
            long reactivated = found.stream().filter(p -> p.getStatus() == ProductStatus.ARCHIVED).count();
            if (reactivated > 0) {
                long count = products.countByStatusNot(ProductStatus.ARCHIVED);
                limits.forEach(l -> l.checkCanAddProduct(tenant, count + reactivated - 1));
            }
        }
        for (ProductEntity p : found) {
            switch (action) {
                case ACTIVATE -> p.changeStatus(ProductStatus.ACTIVE);
                case DRAFT -> p.changeStatus(ProductStatus.DRAFT);
                case ARCHIVE -> p.changeStatus(ProductStatus.ARCHIVED);
                case DELETE -> products.delete(p);
            }
        }
        auditLog.record(AuditEntry.tenant("catalog.product.bulk", tenant, "product", null)
                .with(Map.of("action", action.name(), "count", found.size())));
        return found.size();
    }

    @Transactional
    public void delete(UUID id) {
        ProductEntity p = products.findById(id).orElseThrow(() -> new NotFoundException("Nie znaleziono produktu."));
        products.delete(p);
        auditLog.record(AuditEntry.tenant("catalog.product.deleted", TenantContext.requireTenantId(), "product", id)
                .with(Map.of("name", p.getName())));
    }

    /** Copy as a draft (new slug, SKUs cleared, no stock). */
    @Transactional
    public ProductView duplicate(UUID id) {
        ProductView src = get(id);
        List<VariantInput> vs = src.variants().stream().map(v -> new VariantInput(null, v.optionValues(), null, null, v.priceMinor(),
                v.compareAtMinor(), v.costMinor(), v.weightGrams(), v.lengthMm(), v.widthMm(), v.heightMm(), v.trackInventory(),
                v.allowBackorder(), 0)).toList();
        return create(new ProductInput(truncate(src.name() + " (kopia)", 200), null, src.description(), ProductStatus.DRAFT,
                src.type(), src.brand() == null ? null : src.brand().id(), src.vatRateBps(),
                src.categories().stream().map(CategoryRef::id).toList(), src.seoTitle(), src.seoDescription(),
                src.options().stream().map(o -> new OptionInput(o.name(), o.values())).toList(), vs, 0));
    }

    // ------------------------------------------------------------------------------------------------ export

    /** CSV (semicolon-separated, UTF-8 with BOM — opens correctly in Polish Excel); one row per variant. */
    @Transactional(readOnly = true)
    public String exportCsv() {
        StringBuilder csv = new StringBuilder("﻿");
        csv.append("id_produktu;nazwa;adres;status;typ;vat_proc;kategorie;wariant;sku;ean;cena_brutto;cena_przed_obnizka;stan;waga_g\n");
        UUID tenant = TenantContext.requireTenantId();
        jdbc.query("""
                select p.id, p.name, p.slug, p.status, p.type, p.vat_rate_bps, v.option_values_json, v.sku, v.ean, v.price_minor,
                       v.compare_at_minor, i.on_hand, v.weight_grams,
                       (select string_agg(c.name, ', ' order by c.name) from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = p.id) as cats
                from products p join product_variants v on v.product_id = p.id left join inventory_items i on i.variant_id = v.id
                where p.tenant_id = ? order by lower(p.name), p.id, v.position
                """, rs -> {
                    csv.append(String.join(";", cell(rs.getString(1)), cell(rs.getString(2)), cell(rs.getString(3)), cell(rs.getString(4)),
                            cell(rs.getString(5)), cell(decimal(rs.getInt(6))), cell(rs.getString(14)),
                            cell(inventory.variantTitle(rs.getString(7))), cell(rs.getString(8)), cell(rs.getString(9)),
                            cell(decimal(rs.getLong(10))), cell(rs.getObject(11) == null ? "" : decimal(rs.getLong(11))),
                            cell(rs.getObject(12) == null ? "" : rs.getString(12)), cell(rs.getObject(13) == null ? "" : rs.getString(13))))
                            .append('\n');
                }, tenant);
        return csv.toString();
    }

    private static String decimal(long minor) {
        return java.math.BigDecimal.valueOf(minor, 2).toPlainString().replace('.', ',');
    }

    /** Quotes the value and neutralises spreadsheet formula injection (=, +, -, @ at the start). */
    static String cell(String value) {
        if (value == null) return "";
        String v = value;
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0 && !v.matches("-?[0-9]+(,[0-9]+)?")) {
            v = "'" + v;
        }
        return "\"" + v.replace("\"", "\"\"") + "\"";
    }

    // ------------------------------------------------------------------------------------------------ internals

    private void apply(ProductEntity p, ProductInput in, String name, String slug) {
        int vat = in.vatRateBps() == null ? 2300 : in.vatRateBps();
        if (!VAT_RATES.contains(vat)) throw new BusinessRuleException("INVALID_VAT", "Dozwolone stawki VAT: 23%, 8%, 5%, 0%.");
        if (in.brandId() != null) brands.require(in.brandId());
        List<CategoryEntity> cats = categories.require(in.categoryIds());
        List<OptionInput> options = normaliseOptions(in.options());
        ProductType type = in.type() == null ? ProductType.PHYSICAL : in.type();
        String description = in.description() == null || in.description().isBlank() ? null : in.description().strip();
        if (description != null && description.length() > 20_000) {
            throw new BusinessRuleException("DESCRIPTION_TOO_LONG", "Opis może mieć najwyżej 20 000 znaków.");
        }
        p.update(name, slug, description, type, in.brandId(), vat, json.writeValueAsString(options),
                limit(in.seoTitle(), 160, "Tytuł SEO"), limit(in.seoDescription(), 320, "Opis SEO"));
        syncCategories(p.getId(), cats);
        syncVariants(p, options, in.variants(), type);
    }

    private List<OptionInput> normaliseOptions(List<OptionInput> raw) {
        if (raw == null || raw.isEmpty()) return List.of();
        if (raw.size() > MAX_OPTIONS) throw new BusinessRuleException("TOO_MANY_OPTIONS", "Produkt może mieć najwyżej 3 opcje (np. rozmiar, kolor, materiał).");
        List<OptionInput> result = new ArrayList<>();
        Set<String> names = new HashSet<>();
        for (OptionInput o : raw) {
            String n = o.name() == null ? "" : o.name().trim();
            if (n.isEmpty() || n.length() > 40) throw new BusinessRuleException("INVALID_OPTION", "Nazwa opcji: 1–40 znaków.");
            if (!names.add(n.toLowerCase())) throw new BusinessRuleException("DUPLICATE_OPTION", "Nazwy opcji muszą być różne.");
            List<String> values = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (String v : o.values() == null ? List.<String>of() : o.values()) {
                String t = v == null ? "" : v.trim();
                if (t.isEmpty()) continue;
                if (t.length() > 60) throw new BusinessRuleException("INVALID_OPTION_VALUE", "Wartość opcji może mieć najwyżej 60 znaków.");
                if (seen.add(t.toLowerCase())) values.add(t);
            }
            if (values.isEmpty()) throw new BusinessRuleException("OPTION_WITHOUT_VALUES", "Opcja „" + n + "” nie ma wartości.");
            if (values.size() > MAX_VALUES) throw new BusinessRuleException("TOO_MANY_VALUES", "Opcja może mieć najwyżej 50 wartości.");
            result.add(new OptionInput(n, values));
        }
        return result;
    }

    private void syncVariants(ProductEntity p, List<OptionInput> options, List<VariantInput> inputs, ProductType type) {
        if (inputs == null || inputs.isEmpty()) throw new BusinessRuleException("VARIANT_REQUIRED", "Podaj cenę produktu.");
        if (inputs.size() > MAX_VARIANTS) throw new BusinessRuleException("TOO_MANY_VARIANTS", "Produkt może mieć najwyżej 100 wariantów.");
        if (options.isEmpty() && inputs.size() > 1) {
            throw new BusinessRuleException("VARIANTS_NEED_OPTIONS", "Aby dodać kilka wariantów, zdefiniuj opcje (np. rozmiar).");
        }
        String currency = stores.current().defaultCurrency();
        Map<UUID, VariantEntity> existing = variants.findByProductIdOrderByPositionAsc(p.getId()).stream()
                .collect(Collectors.toMap(VariantEntity::getId, v -> v));
        Set<String> combos = new HashSet<>();
        Set<String> skus = new HashSet<>();
        Set<UUID> kept = new HashSet<>();
        UUID actor = SecurityUtils.currentUser().map(u -> u.id()).orElse(null);
        Instant now = Instant.now();
        int position = 0;
        for (VariantInput in : inputs) {
            Map<String, String> values = normaliseValues(options, in.optionValues());
            if (!combos.add(values.toString().toLowerCase())) {
                throw new BusinessRuleException("DUPLICATE_VARIANT", "Dwa warianty mają te same wartości opcji: " + String.join(" / ", values.values()) + ".");
            }
            String sku = in.sku() == null || in.sku().isBlank() ? null : in.sku().trim();
            if (sku != null) {
                if (sku.length() > 64 || !sku.matches("[\\p{L}\\p{N}._/\\-]+")) {
                    throw new BusinessRuleException("INVALID_SKU", "SKU może zawierać litery, cyfry oraz . _ / - (do 64 znaków).");
                }
                if (!skus.add(sku.toLowerCase()) || variants.skuUsedOutside(sku, p.getId())) {
                    throw new ConflictException("SKU_TAKEN", "SKU „" + sku + "” jest już używane.");
                }
            }
            String ean = in.ean() == null || in.ean().isBlank() ? null : in.ean().trim();
            if (ean != null && !validEan(ean)) throw new BusinessRuleException("INVALID_EAN", "Nieprawidłowy kod EAN/GTIN „" + ean + "”.");
            checkMoney(in.priceMinor(), "Cena");
            if (in.compareAtMinor() != null) {
                checkMoney(in.compareAtMinor(), "Cena przed obniżką");
                if (in.compareAtMinor() <= in.priceMinor()) {
                    throw new BusinessRuleException("INVALID_COMPARE_AT", "Cena przed obniżką musi być wyższa niż cena.");
                }
            }
            if (in.costMinor() != null) checkMoney(in.costMinor(), "Koszt");
            for (Integer dim : new Integer[] {in.weightGrams(), in.lengthMm(), in.widthMm(), in.heightMm()}) {
                if (dim != null && (dim < 0 || dim > 10_000_000)) throw new BusinessRuleException("INVALID_DIMENSION", "Nieprawidłowa waga lub wymiar.");
            }
            VariantEntity v = in.id() == null ? null : existing.get(in.id());
            if (in.id() != null && v == null) throw new BusinessRuleException("VARIANT_NOT_FOUND", "Wariant nie należy do tego produktu.");
            boolean isNew = v == null;
            if (isNew) {
                v = new VariantEntity(p.getId(), currency);
            }
            boolean wasTracked = !isNew && v.isTrackInventory();
            boolean track = in.trackInventory();
            v.update(json.writeValueAsString(values), sku, ean, in.priceMinor(), in.compareAtMinor(), in.costMinor(),
                    type == ProductType.DIGITAL ? null : in.weightGrams(), type == ProductType.DIGITAL ? null : in.lengthMm(),
                    type == ProductType.DIGITAL ? null : in.widthMm(), type == ProductType.DIGITAL ? null : in.heightMm(),
                    track, in.allowBackorder(), position++);
            variants.save(v);
            kept.add(v.getId());
            variants.flush();
            prices.record(v.getId(), in.priceMinor(), now);
            if (track && (isNew || !wasTracked)) {
                inventory.initialise(v.getId(), in.initialStock() == null ? 0 : in.initialStock(), actor);
            } else if (!track && wasTracked) {
                inventory.remove(v.getId());
            }
        }
        existing.values().stream().filter(v -> !kept.contains(v.getId())).forEach(variants::delete);
    }

    private Map<String, String> normaliseValues(List<OptionInput> options, Map<String, String> given) {
        Map<String, String> result = new LinkedHashMap<>();
        Map<String, String> lower = new HashMap<>();
        if (given != null) given.forEach((k, v) -> lower.put(k == null ? "" : k.trim().toLowerCase(), v));
        for (OptionInput o : options) {
            String raw = lower.get(o.name().toLowerCase());
            String match = raw == null ? null : o.values().stream().filter(x -> x.equalsIgnoreCase(raw.trim())).findFirst().orElse(null);
            if (match == null) {
                throw new BusinessRuleException("INVALID_VARIANT_OPTIONS", "Każdy wariant musi mieć wartość opcji „" + o.name() + "” z listy.");
            }
            result.put(o.name(), match);
        }
        if (given != null && given.size() > options.size()) {
            throw new BusinessRuleException("INVALID_VARIANT_OPTIONS", "Wariant ma wartości nieistniejących opcji.");
        }
        return result;
    }

    private void syncCategories(UUID productId, List<CategoryEntity> cats) {
        UUID tenant = TenantContext.requireTenantId();
        jdbc.update("delete from product_categories where tenant_id = ? and product_id = ?", tenant, productId);
        for (CategoryEntity c : cats) {
            jdbc.update("insert into product_categories (tenant_id, product_id, category_id) values (?, ?, ?)", tenant, productId, c.getId());
        }
    }

    private ProductView view(ProductEntity p) {
        List<VariantEntity> vs = variants.findByProductIdOrderByPositionAsc(p.getId());
        List<UUID> ids = vs.stream().map(VariantEntity::getId).toList();
        Map<UUID, Inventory.StockLevel> stock = inventory.levels(ids);
        Map<UUID, Long> lowest = prices.lowestBeforeCurrent(ids);
        List<OptionView> options = json.readValue(p.getOptionsJson(), new TypeReference<List<OptionView>>() { });
        List<VariantView> variantViews = vs.stream().map(v -> {
            Map<String, String> values = json.readValue(v.getOptionValuesJson(), new TypeReference<LinkedHashMap<String, String>>() { });
            Inventory.StockLevel s = stock.get(v.getId());
            return new VariantView(v.getId(), values, String.join(" / ", values.values()), v.getSku(), v.getEan(), v.getPriceMinor(),
                    v.getCompareAtMinor(), v.getCostMinor(), v.getCurrency(), lowest.get(v.getId()), v.getWeightGrams(),
                    v.getLengthMm(), v.getWidthMm(), v.getHeightMm(), v.isTrackInventory(), v.isAllowBackorder(),
                    s == null ? null : s.onHand(), s == null ? null : s.reserved(), s == null ? null : s.available());
        }).toList();
        List<CategoryRef> cats = jdbc.query("""
                select c.id, c.name from product_categories pc join categories c on c.id = pc.category_id
                where pc.tenant_id = ? and pc.product_id = ? order by c.path
                """, (rs, i) -> new CategoryRef(rs.getObject(1, UUID.class), rs.getString(2)), TenantContext.requireTenantId(), p.getId());
        return new ProductView(p.getId(), p.getName(), p.getSlug(), p.getDescription(), p.getStatus(), p.getType(),
                brands.find(p.getBrandId()).orElse(null), p.getVatRateBps(), cats, p.getSeoTitle(), p.getSeoDescription(),
                options, variantViews, p.getPublishedAt(), p.getCreatedAt(), p.getUpdatedAt(), p.getVersion());
    }

    private String uniqueSlug(String raw, UUID self, boolean explicit) {
        String base = Slugs.slugify(raw);
        if (base.isEmpty()) throw new BusinessRuleException("INVALID_SLUG", "Adres produktu musi zawierać litery lub cyfry.");
        if (base.length() > 200) base = base.substring(0, 200).replaceAll("-+$", "");
        String slug = base;
        for (int i = 2; self == null ? products.existsBySlug(slug) : products.existsBySlugAndIdNot(slug, self); i++) {
            if (explicit) throw new ConflictException("SLUG_TAKEN", "Ten adres produktu jest już zajęty.");
            slug = base + "-" + i;
        }
        return slug;
    }

    private static String requireName(String name) {
        if (name == null || name.isBlank()) throw new BusinessRuleException("NAME_REQUIRED", "Podaj nazwę produktu.");
        String n = name.trim();
        if (n.length() > 200) throw new BusinessRuleException("NAME_TOO_LONG", "Nazwa może mieć najwyżej 200 znaków.");
        return n;
    }

    private static String limit(String value, int max, String label) {
        if (value == null || value.isBlank()) return null;
        String v = value.trim();
        if (v.length() > max) throw new BusinessRuleException("TOO_LONG", label + " może mieć najwyżej " + max + " znaków.");
        return v;
    }

    private static void checkMoney(long minor, String label) {
        if (minor < 0 || minor > MAX_PRICE) throw new BusinessRuleException("INVALID_PRICE", label + ": nieprawidłowa kwota.");
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** GTIN-8/12/13/14 with a valid check digit. */
    static boolean validEan(String code) {
        if (!code.matches("[0-9]{8}|[0-9]{12,14}")) return false;
        int sum = 0;
        for (int i = 0; i < code.length() - 1; i++) {
            int digit = code.charAt(code.length() - 2 - i) - '0';
            sum += i % 2 == 0 ? digit * 3 : digit;
        }
        return (10 - sum % 10) % 10 == code.charAt(code.length() - 1) - '0';
    }
}

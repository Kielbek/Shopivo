package pl.shopivo.catalog;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.catalog.CatalogViews.CategoryView;
import pl.shopivo.catalog.internal.CategoryEntity;
import pl.shopivo.catalog.internal.CategoryRepository;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.web.Slugs;

/** Category tree of the current store (max. 5 levels). */
@Service
public class Categories {

    static final int MAX_DEPTH = 4;
    static final int MAX_CATEGORIES = 1000;

    private final CategoryRepository repository;
    private final JdbcTemplate jdbc;
    private final AuditLog auditLog;
    private final pl.shopivo.content.Redirects redirects;

    private final pl.shopivo.media.Media media;

    Categories(CategoryRepository repository, JdbcTemplate jdbc, AuditLog auditLog, pl.shopivo.content.Redirects redirects,
            pl.shopivo.media.Media media) {
        this.media = media;
        this.redirects = redirects;
        this.repository = repository;
        this.jdbc = jdbc;
        this.auditLog = auditLog;
    }

    public record CategoryInput(String name, String slug, String description, UUID parentId, Integer position,
            boolean visible, String seoTitle, String seoDescription, long version) {
    }

    /** Flat list ordered for tree rendering (parents before children). */
    @Transactional(readOnly = true)
    public List<CategoryView> list() {
        Map<UUID, Long> counts = new HashMap<>();
        jdbc.query("select category_id, count(*) from product_categories where tenant_id = ? group by category_id",
                rs -> {
                    counts.put(rs.getObject(1, UUID.class), rs.getLong(2));
                }, TenantContext.requireTenantId());
        List<CategoryEntity> all = repository.findAllByOrderByDepthAscPositionAscNameAsc();
        Map<UUID, List<pl.shopivo.media.Media.ImageView>> images = media.list(pl.shopivo.media.Media.CATEGORY_OWNER, all.stream().map(CategoryEntity::getId).toList());
        return all.stream().map(c -> view(c, counts.getOrDefault(c.getId(), 0L), first(images.get(c.getId())))).toList();
    }

    @Transactional
    public CategoryView create(CategoryInput in) {
        if (repository.count() >= MAX_CATEGORIES) {
            throw new BusinessRuleException("CATEGORY_LIMIT", "Sklep może mieć najwyżej " + MAX_CATEGORIES + " kategorii.");
        }
        String name = requireName(in.name());
        String slug = uniqueSlug(in.slug() == null || in.slug().isBlank() ? name : in.slug(), null, in.slug() != null && !in.slug().isBlank());
        CategoryEntity parent = in.parentId() == null ? null : get(in.parentId());
        if (parent != null && parent.getDepth() >= MAX_DEPTH) {
            throw new BusinessRuleException("CATEGORY_TOO_DEEP", "Kategorie mogą mieć najwyżej 5 poziomów.");
        }
        CategoryEntity c = new CategoryEntity(name, slug);
        c.update(name, slug, blank(in.description()), in.visible(), blank(in.seoTitle()), blank(in.seoDescription()));
        c.placeUnder(parent, in.position() != null ? in.position() : (int) repository.countByParentId(parent == null ? null : parent.getId()));
        repository.save(c);
        auditLog.record(AuditEntry.tenant("catalog.category.created", TenantContext.requireTenantId(), "category", c.getId()));
        return view(c, 0, first(media.list(pl.shopivo.media.Media.CATEGORY_OWNER, List.of(c.getId())).get(c.getId())));
    }

    @Transactional
    public CategoryView update(UUID id, CategoryInput in) {
        CategoryEntity c = get(id);
        if (c.getVersion() != in.version()) {
            throw new ConflictException("VERSION_CONFLICT", "Kategoria została w międzyczasie zmieniona. Odśwież stronę.");
        }
        String name = requireName(in.name());
        String slug = in.slug() == null || in.slug().isBlank() ? c.getSlug() : uniqueSlug(in.slug(), id, true);
        if (!slug.equals(c.getSlug())) redirects.pathChanged("/kategoria/" + c.getSlug(), "/kategoria/" + slug);
        c.update(name, slug, blank(in.description()), in.visible(), blank(in.seoTitle()), blank(in.seoDescription()));
        UUID newParent = in.parentId();
        if (!java.util.Objects.equals(newParent, c.getParentId())) {
            move(c, newParent == null ? null : get(newParent), in.position());
        } else if (in.position() != null) {
            c.setPosition(in.position());
        }
        auditLog.record(AuditEntry.tenant("catalog.category.updated", TenantContext.requireTenantId(), "category", id));
        return view(c, 0, first(media.list(pl.shopivo.media.Media.CATEGORY_OWNER, List.of(c.getId())).get(c.getId())));
    }

    @Transactional
    public void delete(UUID id) {
        CategoryEntity c = get(id);
        if (repository.existsByParentId(id)) {
            throw new BusinessRuleException("CATEGORY_HAS_CHILDREN", "Najpierw usuń lub przenieś podkategorie.");
        }
        media.deleteOwner(pl.shopivo.media.Media.CATEGORY_OWNER, id);
        repository.delete(c);
        auditLog.record(AuditEntry.tenant("catalog.category.deleted", TenantContext.requireTenantId(), "category", id));
    }

    @Transactional(readOnly = true)
    public List<CategoryEntity> require(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        if (ids.size() > 50) throw new BusinessRuleException("TOO_MANY_CATEGORIES", "Produkt może należeć do najwyżej 50 kategorii.");
        List<CategoryEntity> found = repository.findByIdIn(ids);
        if (found.size() != new java.util.HashSet<>(ids).size()) {
            throw new BusinessRuleException("CATEGORY_NOT_FOUND", "Wybrana kategoria nie istnieje.");
        }
        return found;
    }

    private void move(CategoryEntity c, CategoryEntity parent, Integer position) {
        if (parent != null && parent.getPath().startsWith(c.getPath())) {
            throw new BusinessRuleException("CATEGORY_CYCLE", "Nie można przenieść kategorii do jej podkategorii.");
        }
        List<CategoryEntity> descendants = repository.findDescendants(c.getPath(), c.getId());
        int maxRelative = descendants.stream().mapToInt(d -> d.getDepth() - c.getDepth()).max().orElse(0);
        int newDepth = parent == null ? 0 : parent.getDepth() + 1;
        if (newDepth + maxRelative > MAX_DEPTH) {
            throw new BusinessRuleException("CATEGORY_TOO_DEEP", "Kategorie mogą mieć najwyżej 5 poziomów.");
        }
        String oldPrefix = c.getPath();
        int depthDelta = newDepth - c.getDepth();
        c.placeUnder(parent, position != null ? position : (int) repository.countByParentId(parent == null ? null : parent.getId()));
        descendants.forEach(d -> d.rebase(oldPrefix, c.getPath(), depthDelta));
    }

    private CategoryEntity get(UUID id) {
        return repository.findById(id).orElseThrow(() -> new NotFoundException("Nie znaleziono kategorii."));
    }

    private String uniqueSlug(String raw, UUID self, boolean explicit) {
        String base = Slugs.slugify(raw);
        if (base.isEmpty()) throw new BusinessRuleException("INVALID_SLUG", "Adres kategorii musi zawierać litery lub cyfry.");
        if (base.length() > 120) base = base.substring(0, 120);
        String slug = base;
        for (int i = 2; self == null ? repository.existsBySlug(slug) : repository.existsBySlugAndIdNot(slug, self); i++) {
            if (explicit) throw new ConflictException("SLUG_TAKEN", "Ten adres kategorii jest już zajęty.");
            slug = base + "-" + i;
        }
        return slug;
    }

    static String requireName(String name) {
        if (name == null || name.isBlank()) throw new BusinessRuleException("NAME_REQUIRED", "Podaj nazwę.");
        String n = name.trim();
        if (n.length() > 120) throw new BusinessRuleException("NAME_TOO_LONG", "Nazwa może mieć najwyżej 120 znaków.");
        return n;
    }

    static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    static CategoryView view(CategoryEntity c, long productCount, Map<String, String> image) {
        return new CategoryView(c.getId(), c.getParentId(), c.getName(), c.getSlug(), c.getDescription(), c.getPosition(),
                c.getDepth(), c.isVisible(), c.getSeoTitle(), c.getSeoDescription(), productCount, c.getVersion(), image);
    }

    private static Map<String, String> first(List<pl.shopivo.media.Media.ImageView> list) {
        return list == null || list.isEmpty() ? null : list.getFirst().urls();
    }

    /** One picture per category (tiles on the home page and category pages); a new upload replaces the old one. */
    public CategoryView setImage(UUID id, byte[] data) {
        UUID tenant = TenantContext.requireTenantId();
        get(id);
        for (var old : media.list(pl.shopivo.media.Media.CATEGORY_OWNER, List.of(id)).getOrDefault(id, List.of())) {
            media.delete(pl.shopivo.media.Media.CATEGORY_OWNER, id, old.id());
        }
        media.upload(pl.shopivo.media.Media.CATEGORY_OWNER, id, data, null, () -> lockCategory(id));
        auditLog.record(AuditEntry.tenant("catalog.category.image.set", tenant, "category", id));
        return list().stream().filter(c -> c.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public void removeImage(UUID id) {
        lockCategory(id);
        media.deleteOwner(pl.shopivo.media.Media.CATEGORY_OWNER, id);
    }

    private void lockCategory(UUID id) {
        List<UUID> locked = jdbc.query("select id from categories where tenant_id = ? and id = ? for update", (rs, i) -> rs.getObject(1, UUID.class),
                TenantContext.requireTenantId(), id);
        if (locked.isEmpty()) throw new pl.shopivo.shared.error.NotFoundException();
    }
}

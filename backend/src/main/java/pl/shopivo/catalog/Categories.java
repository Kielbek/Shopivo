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

    Categories(CategoryRepository repository, JdbcTemplate jdbc, AuditLog auditLog) {
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
        return repository.findAllByOrderByDepthAscPositionAscNameAsc().stream()
                .map(c -> view(c, counts.getOrDefault(c.getId(), 0L))).toList();
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
        return view(c, 0);
    }

    @Transactional
    public CategoryView update(UUID id, CategoryInput in) {
        CategoryEntity c = get(id);
        if (c.getVersion() != in.version()) {
            throw new ConflictException("VERSION_CONFLICT", "Kategoria została w międzyczasie zmieniona. Odśwież stronę.");
        }
        String name = requireName(in.name());
        String slug = in.slug() == null || in.slug().isBlank() ? c.getSlug() : uniqueSlug(in.slug(), id, true);
        c.update(name, slug, blank(in.description()), in.visible(), blank(in.seoTitle()), blank(in.seoDescription()));
        UUID newParent = in.parentId();
        if (!java.util.Objects.equals(newParent, c.getParentId())) {
            move(c, newParent == null ? null : get(newParent), in.position());
        } else if (in.position() != null) {
            c.setPosition(in.position());
        }
        auditLog.record(AuditEntry.tenant("catalog.category.updated", TenantContext.requireTenantId(), "category", id));
        return view(c, 0);
    }

    @Transactional
    public void delete(UUID id) {
        CategoryEntity c = get(id);
        if (repository.existsByParentId(id)) {
            throw new BusinessRuleException("CATEGORY_HAS_CHILDREN", "Najpierw usuń lub przenieś podkategorie.");
        }
        repository.delete(c);
        auditLog.record(AuditEntry.tenant("catalog.category.deleted", TenantContext.requireTenantId(), "category", id));
    }

    @Transactional(readOnly = true)
    public List<CategoryEntity> require(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
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

    static CategoryView view(CategoryEntity c, long productCount) {
        return new CategoryView(c.getId(), c.getParentId(), c.getName(), c.getSlug(), c.getDescription(), c.getPosition(),
                c.getDepth(), c.isVisible(), c.getSeoTitle(), c.getSeoDescription(), productCount, c.getVersion());
    }
}

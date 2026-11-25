package pl.shopivo.catalog;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.catalog.CatalogViews.BrandView;
import pl.shopivo.catalog.internal.BrandEntity;
import pl.shopivo.catalog.internal.BrandRepository;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.web.Slugs;

@Service
public class Brands {

    private final BrandRepository repository;
    private final JdbcTemplate jdbc;

    Brands(BrandRepository repository, JdbcTemplate jdbc) {
        this.repository = repository;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<BrandView> list() {
        Map<UUID, Long> counts = new HashMap<>();
        jdbc.query("select brand_id, count(*) from products where tenant_id = ? and brand_id is not null group by brand_id",
                rs -> {
                    counts.put(rs.getObject(1, UUID.class), rs.getLong(2));
                }, TenantContext.requireTenantId());
        return repository.findAllByOrderByNameAsc().stream()
                .map(b -> new BrandView(b.getId(), b.getName(), b.getSlug(), counts.getOrDefault(b.getId(), 0L))).toList();
    }

    @Transactional
    public BrandView create(String name) {
        String n = Categories.requireName(name);
        String slug = Slugs.slugify(n);
        if (slug.isEmpty()) throw new BusinessRuleException("INVALID_NAME", "Nazwa marki musi zawierać litery lub cyfry.");
        if (repository.existsBySlug(slug)) throw new ConflictException("BRAND_EXISTS", "Taka marka już istnieje.");
        BrandEntity b = repository.save(new BrandEntity(n, slug));
        return new BrandView(b.getId(), b.getName(), b.getSlug(), 0);
    }

    @Transactional
    public void delete(UUID id) {
        repository.delete(repository.findById(id).orElseThrow(() -> new NotFoundException("Nie znaleziono marki.")));
    }

    @Transactional(readOnly = true)
    public BrandEntity require(UUID id) {
        return repository.findById(id).orElseThrow(() -> new BusinessRuleException("BRAND_NOT_FOUND", "Wybrana marka nie istnieje."));
    }

    @Transactional(readOnly = true)
    public java.util.Optional<BrandView> find(UUID id) {
        return id == null ? java.util.Optional.empty()
                : repository.findById(id).map(b -> new BrandView(b.getId(), b.getName(), b.getSlug(), 0));
    }
}

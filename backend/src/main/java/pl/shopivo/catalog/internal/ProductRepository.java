package pl.shopivo.catalog.internal;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import pl.shopivo.catalog.ProductStatus;

public interface ProductRepository extends JpaRepository<ProductEntity, UUID> {

    boolean existsBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, UUID id);

    long countByStatusNot(ProductStatus status);

    List<ProductEntity> findByIdIn(Collection<UUID> ids);
}

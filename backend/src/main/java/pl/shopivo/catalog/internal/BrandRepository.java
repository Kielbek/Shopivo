package pl.shopivo.catalog.internal;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BrandRepository extends JpaRepository<BrandEntity, UUID> {

    List<BrandEntity> findAllByOrderByNameAsc();

    boolean existsBySlug(String slug);
}

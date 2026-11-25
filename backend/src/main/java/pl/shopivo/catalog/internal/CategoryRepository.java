package pl.shopivo.catalog.internal;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CategoryRepository extends JpaRepository<CategoryEntity, UUID> {

    List<CategoryEntity> findAllByOrderByDepthAscPositionAscNameAsc();

    boolean existsBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, UUID id);

    boolean existsByParentId(UUID parentId);

    long countByParentId(UUID parentId);

    @Query("select c from CategoryEntity c where c.path like concat(:prefix, '%') and c.id <> :id")
    List<CategoryEntity> findDescendants(@Param("prefix") String prefix, @Param("id") UUID id);

    List<CategoryEntity> findByIdIn(Collection<UUID> ids);
}

package pl.shopivo.catalog.internal;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VariantRepository extends JpaRepository<VariantEntity, UUID> {

    List<VariantEntity> findByProductIdOrderByPositionAsc(UUID productId);

    List<VariantEntity> findByProductIdInOrderByPositionAsc(Collection<UUID> productIds);

    List<VariantEntity> findByIdIn(Collection<UUID> ids);

    @Query("select count(v) > 0 from VariantEntity v where lower(v.sku) = lower(:sku) and v.productId <> :productId")
    boolean skuUsedOutside(@Param("sku") String sku, @Param("productId") UUID productId);
}

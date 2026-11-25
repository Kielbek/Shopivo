package pl.shopivo.stores.internal;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreRepository extends JpaRepository<StoreEntity, UUID> {

    /** Within a tenant context Hibernate adds the tenant restriction; exactly one store per tenant (ADR-001). */
    Optional<StoreEntity> findFirstBy();

    boolean existsBySlug(String slug);

    List<StoreEntity> findByTenantIdIn(Collection<UUID> tenantIds);
}

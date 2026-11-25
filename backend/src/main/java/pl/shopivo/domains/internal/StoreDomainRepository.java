package pl.shopivo.domains.internal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StoreDomainRepository extends JpaRepository<StoreDomainEntity, UUID> {

    List<StoreDomainEntity> findAllByOrderByCreatedAtAsc();

    @Query("select d from StoreDomainEntity d where d.primary = true and d.tenantId in :ids")
    List<StoreDomainEntity> findPrimaryByTenantIds(@Param("ids") java.util.Collection<UUID> tenantIds);

    @Query("select d from StoreDomainEntity d where d.hostname = :host and d.status = pl.shopivo.domains.DomainStatus.ACTIVE")
    Optional<StoreDomainEntity> findActiveByHostname(@Param("host") String hostname);
}

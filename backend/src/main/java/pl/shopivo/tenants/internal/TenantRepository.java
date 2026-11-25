package pl.shopivo.tenants.internal;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pl.shopivo.tenants.TenantStatus;

public interface TenantRepository extends JpaRepository<TenantEntity, UUID> {

    long countByStatus(TenantStatus status);

    long countByCreatedAtAfter(Instant since);

    @Query("""
            select t from TenantEntity t
            where (:status is null or t.status = :status)
              and (:q is null or lower(t.name) like concat('%', :q, '%'))
            order by t.createdAt desc
            """)
    Page<TenantEntity> search(@Param("q") String query, @Param("status") TenantStatus status, Pageable pageable);
}

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

    /** {@code query} must be lower-case; an empty string matches every tenant. */
    @Query("select t from TenantEntity t where lower(t.name) like concat('%', :q, '%') order by t.createdAt desc")
    Page<TenantEntity> searchByName(@Param("q") String query, Pageable pageable);

    @Query("""
            select t from TenantEntity t
            where t.status = :status and lower(t.name) like concat('%', :q, '%')
            order by t.createdAt desc
            """)
    Page<TenantEntity> searchByNameAndStatus(@Param("q") String query, @Param("status") TenantStatus status,
            Pageable pageable);
}

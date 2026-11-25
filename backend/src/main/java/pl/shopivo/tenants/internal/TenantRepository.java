package pl.shopivo.tenants.internal;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pl.shopivo.tenants.TenantStatus;

public interface TenantRepository extends JpaRepository<TenantEntity, UUID> {

    /** Serializes membership changes of one tenant (protects the "at least one owner" invariant). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from TenantEntity t where t.id = :id")
    java.util.Optional<TenantEntity> lockById(@Param("id") UUID id);

    long countByStatus(TenantStatus status);

    long countByCreatedAtAfter(Instant since);

    @Query(value = """
            select cast(date_trunc('day', created_at at time zone 'Europe/Warsaw') as date) as day, count(*)
            from tenants where created_at >= :since group by 1 order by 1
            """, nativeQuery = true)
    java.util.List<Object[]> countPerDaySince(@Param("since") Instant since);

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

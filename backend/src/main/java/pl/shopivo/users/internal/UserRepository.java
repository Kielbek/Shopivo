package pl.shopivo.users.internal;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pl.shopivo.users.PlatformRole;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {

    Optional<UserEntity> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByPlatformRole(PlatformRole role);

    long countByCreatedAtAfter(Instant since);

    /** Rows of [local date (Europe/Warsaw), count] for accounts created since the given instant. */
    @Query(value = """
            select cast(date_trunc('day', created_at at time zone 'Europe/Warsaw') as date) as day, count(*)
            from users where created_at >= :since group by 1 order by 1
            """, nativeQuery = true)
    java.util.List<Object[]> countPerDaySince(@Param("since") Instant since);

    Page<UserEntity> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query("""
            select u from UserEntity u
            where lower(cast(u.email as string)) like concat('%', :q, '%')
               or lower(concat(u.firstName, ' ', u.lastName)) like concat('%', :q, '%')
            order by u.createdAt desc
            """)
    Page<UserEntity> search(@Param("q") String query, Pageable pageable);
}

package pl.shopivo.authentication.internal;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface UserSessionRepository extends JpaRepository<UserSessionEntity, UUID> {

    Optional<UserSessionEntity> findByTokenHash(String tokenHash);

    @Query("""
            select s from UserSessionEntity s
            where s.userId = :userId and s.revokedAt is null and s.idleExpiresAt > :now and s.absoluteExpiresAt > :now
            order by s.lastSeenAt desc
            """)
    List<UserSessionEntity> findActive(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Query("""
            update UserSessionEntity s set s.revokedAt = :now, s.revokeReason = :reason
            where s.userId = :userId and s.revokedAt is null and (:except is null or s.id <> :except)
            """)
    int revokeAll(@Param("userId") UUID userId, @Param("except") UUID exceptSessionId, @Param("now") Instant now,
            @Param("reason") String reason);

    @Modifying
    @Query("delete from UserSessionEntity s where s.absoluteExpiresAt < :before or s.revokedAt < :before")
    int deleteExpired(@Param("before") Instant before);
}

package pl.shopivo.authentication.internal;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface UserTokenRepository extends JpaRepository<UserTokenEntity, UUID> {

    Optional<UserTokenEntity> findByTokenHash(String tokenHash);

    @Modifying
    @Query("""
            update UserTokenEntity t set t.consumedAt = :now
            where t.userId = :userId and t.purpose = :purpose and t.consumedAt is null
            """)
    int consumeAll(@Param("userId") UUID userId, @Param("purpose") UserTokenEntity.Purpose purpose, @Param("now") Instant now);

    @Modifying
    @Query("delete from UserTokenEntity t where t.expiresAt < :before")
    int deleteExpired(@Param("before") Instant before);
}

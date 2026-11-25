package pl.shopivo.authentication.internal;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface RecoveryCodeRepository extends JpaRepository<RecoveryCodeEntity, UUID> {

    Optional<RecoveryCodeEntity> findByUserIdAndCodeHash(UUID userId, String codeHash);

    @Query("select count(c) from RecoveryCodeEntity c where c.userId = :userId and c.usedAt is null")
    long countUnused(@Param("userId") UUID userId);

    @Modifying
    @Query("delete from RecoveryCodeEntity c where c.userId = :userId")
    int deleteAllForUser(@Param("userId") UUID userId);
}

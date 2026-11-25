package pl.shopivo.tenants.internal;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvitationRepository extends JpaRepository<InvitationEntity, UUID> {

    Optional<InvitationEntity> findByTokenHash(String tokenHash);

    @Query("""
            select i from InvitationEntity i
            where i.acceptedAt is null and i.revokedAt is null and i.expiresAt > :now
            order by i.createdAt desc
            """)
    List<InvitationEntity> findPending(@Param("now") Instant now);

    @Query("""
            select i from InvitationEntity i
            where i.email = :email and i.acceptedAt is null and i.revokedAt is null
            """)
    Optional<InvitationEntity> findOpenForEmail(@Param("email") String email);
}

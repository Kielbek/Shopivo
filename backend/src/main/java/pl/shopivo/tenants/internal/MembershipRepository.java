package pl.shopivo.tenants.internal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pl.shopivo.tenants.MembershipStatus;
import pl.shopivo.tenants.StoreRole;

public interface MembershipRepository extends JpaRepository<MembershipEntity, UUID> {

    Optional<MembershipEntity> findByTenantIdAndUserId(UUID tenantId, UUID userId);

    Optional<MembershipEntity> findByIdAndTenantId(UUID id, UUID tenantId);

    List<MembershipEntity> findByUserIdOrderByCreatedAtAsc(UUID userId);

    List<MembershipEntity> findByTenantIdOrderByCreatedAtAsc(UUID tenantId);

    long countByTenantIdAndRoleAndStatus(UUID tenantId, StoreRole role, MembershipStatus status);

    long countByUserIdAndRole(UUID userId, StoreRole role);

    @Query("""
            select m from MembershipEntity m, TenantEntity t
            where t.id = m.tenantId and m.userId = :userId and m.tenantId = :tenantId
              and m.status = pl.shopivo.tenants.MembershipStatus.ACTIVE
              and t.status = pl.shopivo.tenants.TenantStatus.ACTIVE
            """)
    Optional<MembershipEntity> findActive(@Param("userId") UUID userId, @Param("tenantId") UUID tenantId);
}

package pl.shopivo.subscriptions.internal;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pl.shopivo.subscriptions.SubscriptionStatus;

public interface SubscriptionRepository extends JpaRepository<SubscriptionEntity, UUID> {

    /** In a tenant context Hibernate restricts this to the current tenant (one subscription per tenant). */
    Optional<SubscriptionEntity> findFirstBy();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from SubscriptionEntity s where s.id = :id")
    Optional<SubscriptionEntity> lock(@Param("id") UUID id);

    Optional<SubscriptionEntity> findByTenantId(UUID tenantId);

    // ---- lifecycle job (system context)
    @Query("select s.tenantId from SubscriptionEntity s where s.status = 'TRIALING' and s.trialEndsAt <= :now")
    List<UUID> trialsEndedBy(@Param("now") Instant now);

    @Query("select s.tenantId from SubscriptionEntity s where s.status = 'TRIALING' and s.trialEndsAt <= :until and s.trialEndsAt > :now")
    List<UUID> trialsEndingBetween(@Param("now") Instant now, @Param("until") Instant until);

    @Query("""
            select s.tenantId from SubscriptionEntity s
            where s.status = 'ACTIVE' and s.cancelAtPeriodEnd = false and s.currentPeriodEnd <= :until
            """)
    List<UUID> dueForRenewal(@Param("until") Instant until);

    @Query("select s.tenantId from SubscriptionEntity s where s.status in ('ACTIVE') and s.currentPeriodEnd <= :now")
    List<UUID> periodEndedBy(@Param("now") Instant now);

    @Query("select s.tenantId from SubscriptionEntity s where s.status = 'PAST_DUE' and s.graceUntil <= :now")
    List<UUID> graceEndedBy(@Param("now") Instant now);

    List<SubscriptionEntity> findByStatusIn(List<SubscriptionStatus> statuses);

    long countByStatus(SubscriptionStatus status);
}

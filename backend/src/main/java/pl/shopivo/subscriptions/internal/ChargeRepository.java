package pl.shopivo.subscriptions.internal;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChargeRepository extends JpaRepository<ChargeEntity, UUID> {

    List<ChargeEntity> findAllByOrderByIssuedAtDesc();

    List<ChargeEntity> findBySubscriptionId(UUID subscriptionId);

    @Query("select c from ChargeEntity c where c.subscriptionId = :sid and c.kind = :kind and c.status in ('OPEN', 'FAILED')")
    Optional<ChargeEntity> findUnpaid(@Param("sid") UUID subscriptionId, @Param("kind") ChargeEntity.Kind kind);

    @Query("select c from ChargeEntity c where c.subscriptionId = :sid and c.status in ('OPEN', 'FAILED') order by c.issuedAt desc")
    List<ChargeEntity> findAllUnpaid(@Param("sid") UUID subscriptionId);

    /** System context: open charges that may need a reminder. */
    @Query("select c.tenantId from ChargeEntity c where c.status in ('OPEN', 'FAILED') and c.dueAt <= :until and c.remindersSent < :max")
    List<UUID> tenantsWithChargesToRemind(@Param("until") Instant until, @Param("max") int maxReminders);

    @Query(value = "select nextval('subscription_charge_number_seq')", nativeQuery = true)
    long nextNumber();
}

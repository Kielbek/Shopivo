package pl.shopivo.billing.internal;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WebhookEventRepository extends JpaRepository<WebhookEventEntity, UUID> {

    Optional<WebhookEventEntity> findByProviderAndEventId(String provider, String eventId);

    @Query("select w from WebhookEventEntity w where w.status = 'FAILED' and w.attempts < :maxAttempts order by w.receivedAt")
    List<WebhookEventEntity> findRetryable(@Param("maxAttempts") int maxAttempts);

    @Modifying
    @Query("delete from WebhookEventEntity w where w.receivedAt < :before and w.status in ('PROCESSED', 'IGNORED')")
    int deleteProcessedBefore(@Param("before") Instant before);
}

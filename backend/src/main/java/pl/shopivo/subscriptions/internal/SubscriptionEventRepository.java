package pl.shopivo.subscriptions.internal;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubscriptionEventRepository extends JpaRepository<SubscriptionEventEntity, UUID> {

    List<SubscriptionEventEntity> findTop50ByOrderByCreatedAtDesc();

    boolean existsBySubscriptionIdAndTypeAndDetail(UUID subscriptionId, String type, String detail);
}

package pl.shopivo.subscriptions.internal;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import pl.shopivo.subscriptions.BillingInterval;

public interface PriceRepository extends JpaRepository<PriceEntity, UUID> {

    List<PriceEntity> findByPlanIdInAndActiveTrue(Collection<UUID> planIds);

    Optional<PriceEntity> findByPlanIdAndIntervalAndCurrencyAndActiveTrue(UUID planId, BillingInterval interval, String currency);
}

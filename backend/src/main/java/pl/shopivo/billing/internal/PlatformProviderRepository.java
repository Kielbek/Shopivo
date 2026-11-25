package pl.shopivo.billing.internal;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PlatformProviderRepository extends JpaRepository<PlatformProviderEntity, String> {

    @Query("select p from PlatformProviderEntity p where p.activeForBilling = true")
    Optional<PlatformProviderEntity> findActive();
}

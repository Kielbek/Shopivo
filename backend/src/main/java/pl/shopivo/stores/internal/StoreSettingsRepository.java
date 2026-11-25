package pl.shopivo.stores.internal;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreSettingsRepository extends JpaRepository<StoreSettingsEntity, UUID> {

    Optional<StoreSettingsEntity> findFirstBy();
}

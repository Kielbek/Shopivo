package pl.shopivo.audit.internal;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLogEntity, UUID> {

    Page<AuditLogEntity> findByTenantIdOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);

    Page<AuditLogEntity> findAllByOrderByCreatedAtDesc(Pageable pageable);
}

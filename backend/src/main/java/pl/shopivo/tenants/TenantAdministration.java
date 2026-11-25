package pl.shopivo.tenants;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.tenants.internal.TenantEntity;
import pl.shopivo.tenants.internal.TenantRepository;

/** Platform-administration operations on tenants. Callers must run in system context. */
@Service
@Transactional
public class TenantAdministration {

    private final TenantRepository tenants;
    private final AuditLog auditLog;
    private final ApplicationEventPublisher events;

    TenantAdministration(TenantRepository tenants, AuditLog auditLog, ApplicationEventPublisher events) {
        this.tenants = tenants;
        this.auditLog = auditLog;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public Page<TenantView> search(String query, TenantStatus status, Pageable pageable) {
        requireSystem();
        String q = query == null || query.isBlank() ? null : query.trim().toLowerCase(Locale.ROOT);
        return tenants.search(q, status, pageable).map(TenantEntity::toView);
    }

    @Transactional(readOnly = true)
    public TenantView get(UUID id) {
        requireSystem();
        return tenants.findById(id).map(TenantEntity::toView).orElseThrow(NotFoundException::new);
    }

    public TenantView suspend(UUID id, String reason) {
        requireSystem();
        TenantEntity tenant = tenants.findById(id).orElseThrow(NotFoundException::new);
        if (tenant.getStatus() != TenantStatus.ACTIVE) {
            throw new BusinessRuleException("INVALID_STATUS", "Można zawiesić tylko aktywny sklep.");
        }
        tenant.suspend(reason);
        auditLog.record(AuditEntry.tenant("admin.tenant.suspended", id, "tenant", id).with(Map.of("reason", reason)));
        events.publishEvent(new TenantStatusChangedEvent(id, TenantStatus.SUSPENDED));
        return tenant.toView();
    }

    public TenantView reactivate(UUID id) {
        requireSystem();
        TenantEntity tenant = tenants.findById(id).orElseThrow(NotFoundException::new);
        if (tenant.getStatus() != TenantStatus.SUSPENDED) {
            throw new BusinessRuleException("INVALID_STATUS", "Można przywrócić tylko zawieszony sklep.");
        }
        tenant.reactivate();
        auditLog.record(AuditEntry.tenant("admin.tenant.reactivated", id, "tenant", id));
        events.publishEvent(new TenantStatusChangedEvent(id, TenantStatus.ACTIVE));
        return tenant.toView();
    }

    @Transactional(readOnly = true)
    public TenantStats stats(Instant since) {
        requireSystem();
        return new TenantStats(tenants.count(), tenants.countByStatus(TenantStatus.ACTIVE),
                tenants.countByStatus(TenantStatus.SUSPENDED), tenants.countByCreatedAtAfter(since));
    }

    public record TenantStats(long total, long active, long suspended, long createdSince) {
    }

    private static void requireSystem() {
        if (!TenantContext.isSystem()) {
            throw new IllegalStateException("Tenant administration requires system context");
        }
    }
}

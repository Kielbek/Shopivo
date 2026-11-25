package pl.shopivo.audit;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.internal.AuditLogEntity;
import pl.shopivo.audit.internal.AuditLogRepository;
import pl.shopivo.shared.security.CurrentUser;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.web.ClientInfo;
import tools.jackson.databind.json.JsonMapper;

/** Append-only audit trail. Joins the caller's transaction so entries commit atomically with the change. */
@Service
public class AuditLog {

    private final AuditLogRepository repository;
    private final JsonMapper jsonMapper;

    AuditLog(AuditLogRepository repository, JsonMapper jsonMapper) {
        this.repository = repository;
        this.jsonMapper = jsonMapper;
    }

    @Transactional
    public void record(AuditEntry entry) {
        CurrentUser user = SecurityUtils.currentUser().orElse(null);
        UUID actorId = user != null ? user.id() : TenantContext.userId().orElse(null);
        String actorType;
        if (user != null && user.isPlatformStaff() && entry.tenantId() != null && TenantContext.isSystem()) {
            actorType = "PLATFORM_ADMIN";
        } else if (actorId != null) {
            actorType = "USER";
        } else {
            actorType = "ANONYMOUS";
        }
        recordAs(entry, actorId, actorType);
    }

    @Transactional
    public void recordSystem(AuditEntry entry) {
        recordAs(entry, null, "SYSTEM");
    }

    private void recordAs(AuditEntry entry, UUID actorId, String actorType) {
        String metadata = entry.metadata() == null || entry.metadata().isEmpty()
                ? "{}" : jsonMapper.writeValueAsString(entry.metadata());
        repository.save(new AuditLogEntity(entry.tenantId(), actorId, actorType, entry.action(),
                entry.targetType(), entry.targetId(), ClientInfo.current().ipAddress(), metadata));
    }

    /** Entries of the tenant bound to the current context (RLS + explicit filter). */
    @Transactional(readOnly = true)
    public Page<AuditLogView> tenantEntries(Pageable pageable) {
        UUID tenantId = TenantContext.requireTenantId();
        return repository.findByTenantIdOrderByCreatedAtDesc(tenantId, pageable).map(AuditLogEntity::toView);
    }

    /** All entries — platform administration only (caller must run in system context). */
    @Transactional(readOnly = true)
    public Page<AuditLogView> allEntries(UUID tenantId, Pageable pageable) {
        if (!TenantContext.isSystem()) {
            throw new IllegalStateException("Platform audit log requires system context");
        }
        Page<AuditLogEntity> page = tenantId == null
                ? repository.findAllByOrderByCreatedAtDesc(pageable)
                : repository.findByTenantIdOrderByCreatedAtDesc(tenantId, pageable);
        return page.map(AuditLogEntity::toView);
    }
}

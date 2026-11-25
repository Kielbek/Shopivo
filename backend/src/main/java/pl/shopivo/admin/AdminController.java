package pl.shopivo.admin;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.audit.AuditLogView;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.security.SecurityUtils;
import pl.shopivo.shared.tenancy.TenantContext;
import pl.shopivo.shared.web.PageResponse;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.Stores;
import pl.shopivo.tenants.TenantAdministration;
import pl.shopivo.tenants.TenantStatus;
import pl.shopivo.tenants.TenantView;
import pl.shopivo.users.UserAccounts;
import pl.shopivo.users.UserStatus;
import pl.shopivo.users.UserView;

/**
 * Super-admin API. Read endpoints are available to PLATFORM_ADMIN and PLATFORM_SUPPORT (path rule in the security
 * configuration); mutations require PLATFORM_ADMIN.
 */
@RestController
@RequestMapping("/api/v1/admin")
@Tag(name = "Platform administration")
class AdminController {

    private final TenantAdministration tenants;
    private final Stores stores;
    private final UserAccounts users;
    private final AuditLog auditLog;
    private final TransactionTemplate tx;

    AdminController(TenantAdministration tenants, Stores stores, UserAccounts users, AuditLog auditLog,
            TransactionTemplate tx) {
        this.tenants = tenants;
        this.stores = stores;
        this.users = users;
        this.auditLog = auditLog;
        this.tx = tx;
    }

    record Overview(long users, long usersInPeriod, long stores, long activeStores, long suspendedStores,
            long storesInPeriod) {
    }

    record TenantRow(TenantView tenant, StoreView store, UserView owner) {
    }

    record SuspendRequest(@NotBlank @Size(max = 500) String reason) {
    }

    record Growth(List<LocalDate> days, List<Long> users, List<Long> stores) {
    }

    @GetMapping("/overview")
    Overview overview(@RequestParam(defaultValue = "30") int days) {
        Instant since = Instant.now().minus(Math.clamp(days, 1, 365), ChronoUnit.DAYS);
        return TenantContext.callAsSystem(() -> {
            TenantAdministration.TenantStats stats = tenants.stats(since);
            return new Overview(users.count(), users.countCreatedSince(since), stats.total(), stats.active(),
                    stats.suspended(), stats.createdSince());
        });
    }

    /** Daily registrations and new stores for the last {@code days} days (Europe/Warsaw calendar days, zero-filled). */
    @GetMapping("/stats/growth")
    Growth growth(@RequestParam(defaultValue = "30") int days) {
        int range = Math.clamp(days, 1, 365);
        ZoneId zone = ZoneId.of("Europe/Warsaw");
        LocalDate first = LocalDate.now(zone).minusDays(range - 1L);
        Instant since = first.atStartOfDay(zone).toInstant();
        return TenantContext.callAsSystem(() -> {
            Map<LocalDate, Long> users = this.users.registrationsPerDay(since);
            Map<LocalDate, Long> stores = tenants.creationsPerDay(since);
            List<LocalDate> labels = first.datesUntil(first.plusDays(range)).toList();
            return new Growth(labels, labels.stream().map(d -> users.getOrDefault(d, 0L)).toList(),
                    labels.stream().map(d -> stores.getOrDefault(d, 0L)).toList());
        });
    }

    @GetMapping("/tenants")
    PageResponse<TenantRow> tenants(@RequestParam(required = false) String q,
            @RequestParam(required = false) TenantStatus status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return TenantContext.callAsSystem(() -> {
            Page<TenantView> result = tenants.search(q, status, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100)));
            Map<UUID, StoreView> storesByTenant = stores.byTenantIds(result.map(TenantView::id).getContent());
            return PageResponse.of(result, t -> new TenantRow(t, storesByTenant.get(t.id()),
                    users.findById(t.createdBy()).orElse(null)));
        });
    }

    @GetMapping("/tenants/{tenantId}")
    TenantRow tenant(@PathVariable UUID tenantId) {
        return TenantContext.callAsSystem(() -> {
            TenantView t = tenants.get(tenantId);
            return new TenantRow(t, stores.byTenantIds(java.util.List.of(tenantId)).get(tenantId),
                    users.findById(t.createdBy()).orElse(null));
        });
    }

    @PostMapping("/tenants/{tenantId}/suspend")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    TenantView suspendTenant(@PathVariable UUID tenantId, @Valid @RequestBody SuspendRequest request) {
        return TenantContext.callAsSystem(() -> tenants.suspend(tenantId, request.reason().trim()));
    }

    @PostMapping("/tenants/{tenantId}/reactivate")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    TenantView reactivateTenant(@PathVariable UUID tenantId) {
        return TenantContext.callAsSystem(() -> tenants.reactivate(tenantId));
    }

    @GetMapping("/users")
    PageResponse<UserView> users(@RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(users.search(q, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))), u -> u);
    }

    @PostMapping("/users/{userId}/suspend")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    UserView suspendUser(@PathVariable UUID userId) {
        if (userId.equals(SecurityUtils.requireUser().id())) {
            throw new BusinessRuleException("CANNOT_SUSPEND_SELF", "Nie możesz zablokować własnego konta.");
        }
        UserView user = users.getById(userId);
        if (user.platformRole() != null) {
            throw new BusinessRuleException("CANNOT_SUSPEND_STAFF", "Nie można zablokować konta administratora platformy.");
        }
        return tx.execute(s -> {
            UserView result = users.changeStatus(userId, UserStatus.SUSPENDED);
            auditLog.record(AuditEntry.platform("admin.user.suspended", "user", userId));
            return result;
        });
    }

    @PostMapping("/users/{userId}/reactivate")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    UserView reactivateUser(@PathVariable UUID userId) {
        UserView user = users.getById(userId);
        if (user.status() != UserStatus.SUSPENDED) {
            throw new BusinessRuleException("INVALID_STATUS", "Można odblokować tylko zablokowane konto.");
        }
        return tx.execute(s -> {
            UserView result = users.changeStatus(userId,
                    user.emailVerified() ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION);
            auditLog.record(AuditEntry.platform("admin.user.reactivated", "user", userId));
            return result;
        });
    }

    @GetMapping("/audit-logs")
    PageResponse<AuditLogView> auditLogs(@RequestParam(required = false) UUID tenantId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        return TenantContext.callAsSystem(() -> PageResponse.of(
                auditLog.allEntries(tenantId, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))), v -> v));
    }
}

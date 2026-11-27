package pl.shopivo.themes;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.media.Media;
import pl.shopivo.shared.tenancy.TenantContext;

/** The store's image library for the theme (banners, logo, image with text). Owned by the store itself. */
@Service
public class ThemeImages {

    private final Media media;
    private final AuditLog auditLog;

    ThemeImages(Media media, AuditLog auditLog) {
        this.media = media;
        this.auditLog = auditLog;
    }

    @Transactional(readOnly = true)
    public List<Media.ImageView> list() {
        UUID tenant = TenantContext.requireTenantId();
        return media.list(Media.THEME_OWNER, List.of(tenant)).getOrDefault(tenant, List.of());
    }

    /** Not transactional — see {@link Media#upload}. */
    public Media.ImageView upload(byte[] data, String alt) {
        UUID tenant = TenantContext.requireTenantId();
        Media.ImageView image = media.upload(Media.THEME_OWNER, tenant, data, alt, () -> { });
        auditLog.record(AuditEntry.tenant("theme.image.added", tenant, "theme", null));
        return image;
    }

    @Transactional
    public void delete(UUID imageId) {
        UUID tenant = TenantContext.requireTenantId();
        media.delete(Media.THEME_OWNER, tenant, imageId);
        auditLog.record(AuditEntry.tenant("theme.image.deleted", tenant, "theme", null));
    }

    /**
     * Image id → URLs, for the storefront: the store's library plus the templates' own images ({@code tpl:…}). Ids that
     * are not in the store's library are simply absent.
     */
    @Transactional(readOnly = true)
    public Map<String, Map<String, String>> urls() {
        Map<String, Map<String, String>> out = new java.util.LinkedHashMap<>(ThemeAssets.urls());
        out.putAll(list().stream().collect(Collectors.toMap(i -> i.id().toString(), Media.ImageView::urls)));
        return out;
    }
}

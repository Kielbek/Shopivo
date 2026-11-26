package pl.shopivo.media;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.NotFoundException;
import pl.shopivo.shared.persistence.UuidV7;
import pl.shopivo.shared.tenancy.TenantContext;

/** Images of the current store. Storage objects are written before the row and removed only after commit. */
@Service
public class Media {

    private static final Logger log = LoggerFactory.getLogger(Media.class);
    public static final int MAX_PER_OWNER = 10;
    /** Store-wide library of images used by the storefront theme (banners, logo, image with text). */
    public static final String THEME_OWNER = "THEME";
    public static final String CATEGORY_OWNER = "CATEGORY";

    static int limit(String ownerType) {
        return switch (ownerType) {
            case THEME_OWNER -> 40;
            case CATEGORY_OWNER -> 1;
            default -> MAX_PER_OWNER;
        };
    }

    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;
    private final ImageProcessor images;
    private final List<MediaQuotaPolicy> quota;
    private final TransactionTemplate tx;

    Media(JdbcTemplate jdbc, ObjectStorage storage, ImageProcessor images, List<MediaQuotaPolicy> quota, TransactionTemplate tx) {
        this.tx = tx;
        this.jdbc = jdbc;
        this.storage = storage;
        this.images = images;
        this.quota = quota;
    }

    public record ImageView(UUID id, String alt, int width, int height, int position, Map<String, String> urls) {
    }

    /**
     * Stores an image of {@code ownerId}. Deliberately not transactional: decoding and resizing (up to 40 MP) and the
     * uploads to object storage happen <em>before</em> a short transaction, so no database connection or lock is held
     * during slow work. Inside that transaction {@code lockOwner} must lock the owner row (and throw if it no longer
     * exists), and a per-store advisory lock serialises the image-count and storage-quota checks so concurrent uploads
     * cannot exceed them. Files are removed again if the transaction does not commit.
     */
    public ImageView upload(String ownerType, UUID ownerId, byte[] data, String alt, Runnable lockOwner) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Media.upload must be called outside a transaction");
        }
        UUID tenant = TenantContext.requireTenantId();
        // Cheap pre-check so an obviously rejected upload is not processed at all (re-checked under the lock below).
        tx.executeWithoutResult(s -> {
            lockOwner.run();
            checkCount(tenant, ownerType, ownerId);
        });
        ImageProcessor.Processed p = images.processLimited(data);
        long total = data.length + p.variants().values().stream().mapToLong(v -> v.length).sum();
        UUID id = UuidV7.generate();
        String base = "t/" + tenant + "/" + id + "/";
        String original = base + "orig." + ("png".equals(p.format()) ? "png" : "jpg");
        List<String> written = new ArrayList<>();
        try {
            storage.put(original, data, "image/" + p.format());
            written.add(original);
            for (var v : p.variants().entrySet()) {
                storage.put(base + "w" + v.getKey() + ".jpg", v.getValue(), "image/jpeg");
                written.add(base + "w" + v.getKey() + ".jpg");
            }
        } catch (RuntimeException e) {
            written.forEach(this::quietDelete);
            log.error("Storing image failed", e);
            throw new BusinessRuleException("STORAGE_UNAVAILABLE", "Nie udało się zapisać zdjęcia. Spróbuj ponownie.");
        }
        try {
            return tx.execute(s -> {
                jdbc.query("select pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { }, "media:" + tenant);
                lockOwner.run();
                int position = checkCount(tenant, ownerType, ownerId);
                long used = usedBytes();
                quota.forEach(q -> q.checkCanStore(tenant, used, total));
                jdbc.update("""
                        insert into media_assets (id, tenant_id, owner_type, owner_id, storage_key, content_type, width, height, total_bytes, alt, position)
                        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, id, tenant, ownerType, ownerId, base, "image/" + p.format(), p.width(), p.height(), total, clean(alt), position);
                return new ImageView(id, clean(alt), p.width(), p.height(), position, urls(tenant, id));
            });
        } catch (RuntimeException e) {
            written.forEach(this::quietDelete);
            throw e;
        }
    }

    /** Returns the number of images the owner already has (= position of the next one) or refuses when full. */
    private int checkCount(UUID tenant, String ownerType, UUID ownerId) {
        Integer count = jdbc.queryForObject("select count(*) from media_assets where tenant_id = ? and owner_type = ? and owner_id = ?",
                Integer.class, tenant, ownerType, ownerId);
        int n = count == null ? 0 : count;
        int max = limit(ownerType);
        if (n >= max) {
            throw new BusinessRuleException("TOO_MANY_IMAGES", max == 1 ? "Można dodać jedno zdjęcie — usuń obecne, aby dodać nowe."
                    : "Można dodać najwyżej " + max + " zdjęć.");
        }
        return n;
    }

    @Transactional(readOnly = true)
    public Map<UUID, List<ImageView>> list(String ownerType, Collection<UUID> ownerIds) {
        Map<UUID, List<ImageView>> result = new HashMap<>();
        if (ownerIds.isEmpty()) return result;
        UUID tenant = TenantContext.requireTenantId();
        jdbc.query("""
                select id, owner_id, alt, width, height, position from media_assets
                where tenant_id = ? and owner_type = ? and owner_id = any(?) order by position, created_at
                """, rs -> {
                    UUID id = rs.getObject("id", UUID.class);
                    result.computeIfAbsent(rs.getObject("owner_id", UUID.class), k -> new ArrayList<>()).add(new ImageView(id,
                            rs.getString("alt"), rs.getInt("width"), rs.getInt("height"), rs.getInt("position"), urls(tenant, id)));
                }, tenant, ownerType, ownerIds.toArray(UUID[]::new));
        return result;
    }

    @Transactional
    public void delete(String ownerType, UUID ownerId, UUID imageId) {
        UUID tenant = TenantContext.requireTenantId();
        List<String> keys = jdbc.query("delete from media_assets where id = ? and tenant_id = ? and owner_type = ? and owner_id = ? returning storage_key",
                (rs, i) -> rs.getString(1), imageId, tenant, ownerType, ownerId);
        if (keys.isEmpty()) throw new NotFoundException("Nie znaleziono zdjęcia.");
        renumber(ownerType, ownerId);
        afterCommitDelete(keys);
    }

    @Transactional
    public void deleteOwner(String ownerType, UUID ownerId) {
        List<String> keys = jdbc.query("delete from media_assets where tenant_id = ? and owner_type = ? and owner_id = ? returning storage_key",
                (rs, i) -> rs.getString(1), TenantContext.requireTenantId(), ownerType, ownerId);
        afterCommitDelete(keys);
    }

    @Transactional
    public void update(String ownerType, UUID ownerId, List<UUID> order, Map<UUID, String> alts) {
        UUID tenant = TenantContext.requireTenantId();
        List<UUID> existing = jdbc.query("select id from media_assets where tenant_id = ? and owner_type = ? and owner_id = ? order by position",
                (rs, i) -> rs.getObject(1, UUID.class), tenant, ownerType, ownerId);
        if (order != null) {
            if (order.size() != existing.size() || !existing.containsAll(order)) {
                throw new BusinessRuleException("INVALID_ORDER", "Kolejność musi zawierać wszystkie zdjęcia produktu.");
            }
            for (int i = 0; i < order.size(); i++) {
                jdbc.update("update media_assets set position = ? where id = ? and tenant_id = ?", i, order.get(i), tenant);
            }
        }
        if (alts != null) {
            for (var e : alts.entrySet()) {
                if (!existing.contains(e.getKey())) throw new NotFoundException("Nie znaleziono zdjęcia.");
                jdbc.update("update media_assets set alt = ? where id = ? and tenant_id = ?", clean(e.getValue()), e.getKey(), tenant);
            }
        }
    }

    @Transactional(readOnly = true)
    public long usedBytes() {
        Long used = jdbc.queryForObject("select coalesce(sum(total_bytes), 0) from media_assets where tenant_id = ?", Long.class,
                TenantContext.requireTenantId());
        return used == null ? 0 : used;
    }

    /** Public URLs of the variants (paths relative to the API origin). */
    public static Map<String, String> urls(UUID tenantId, UUID imageId) {
        Map<String, String> urls = new java.util.LinkedHashMap<>();
        for (int w : ImageProcessor.WIDTHS) urls.put("w" + w, "/api/v1/media/" + tenantId + "/" + imageId + "/w" + w + ".jpg");
        return urls;
    }

    private void renumber(String ownerType, UUID ownerId) {
        jdbc.update("""
                update media_assets m set position = r.rn - 1 from (
                    select id, row_number() over (order by position, created_at) as rn from media_assets
                    where tenant_id = ? and owner_type = ? and owner_id = ?) r
                where m.id = r.id
                """, TenantContext.requireTenantId(), ownerType, ownerId);
    }

    private void afterCommitDelete(List<String> bases) {
        if (bases.isEmpty()) return;
        Runnable remove = () -> bases.forEach(base -> {
            for (String suffix : List.of("orig.jpg", "orig.png", "w400.jpg", "w1200.jpg")) quietDelete(base + suffix);
        });
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    remove.run();
                }
            });
        } else {
            remove.run();
        }
    }

    private void quietDelete(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            log.warn("Could not delete media object {}: {}", key, e.getMessage());
        }
    }

    private static String clean(String alt) {
        if (alt == null || alt.isBlank()) return null;
        String a = alt.strip();
        return a.length() > 200 ? a.substring(0, 200) : a;
    }
}

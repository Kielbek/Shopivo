package pl.shopivo.media;

import java.util.Optional;

/** Minimal object storage used for media (S3 / R2 / MinIO in production, local directory in development and tests). */
public interface ObjectStorage {

    void put(String key, byte[] content, String contentType);

    Optional<byte[]> get(String key);

    void delete(String key);
}

package pl.shopivo.media.internal;

import java.util.Optional;
import pl.shopivo.media.ObjectStorage;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/** S3-compatible storage (AWS S3, Cloudflare R2, MinIO). The bucket stays private; files are served by the backend/CDN. */
class S3ObjectStorage implements ObjectStorage {

    private final S3Client client;
    private final String bucket;

    S3ObjectStorage(S3Client client, String bucket) {
        this.client = client;
        this.bucket = bucket;
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build(), RequestBody.fromBytes(content));
    }

    @Override
    public Optional<byte[]> get(String key) {
        try {
            return Optional.of(client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build()).asByteArray());
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        }
    }

    @Override
    public void delete(String key) {
        client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }
}

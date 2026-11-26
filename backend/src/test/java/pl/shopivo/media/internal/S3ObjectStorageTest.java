package pl.shopivo.media.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/**
 * Runs against a real S3-compatible endpoint (MinIO, moto, R2…) when SHOPIVO_TEST_S3_ENDPOINT is set; skipped otherwise.
 * Example: moto_server -p 9999 → SHOPIVO_TEST_S3_ENDPOINT=http://localhost:9999
 */
@EnabledIfEnvironmentVariable(named = "SHOPIVO_TEST_S3_ENDPOINT", matches = ".+")
class S3ObjectStorageTest {

    @Test
    void putGetDeleteRoundTrip() {
        S3Client client = S3Client.builder().region(Region.US_EAST_1)
                .endpointOverride(URI.create(System.getenv("SHOPIVO_TEST_S3_ENDPOINT")))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).build();
        String bucket = "shopivo-test-" + System.nanoTime();
        client.createBucket(b -> b.bucket(bucket));
        S3ObjectStorage storage = new S3ObjectStorage(client, bucket);

        storage.put("t/1/a/w400.jpg", new byte[] {1, 2, 3}, "image/jpeg");
        assertThat(storage.get("t/1/a/w400.jpg")).hasValueSatisfying(b -> assertThat(b).containsExactly(1, 2, 3));
        assertThat(storage.get("t/1/a/missing.jpg")).isEmpty();
        storage.delete("t/1/a/w400.jpg");
        assertThat(storage.get("t/1/a/w400.jpg")).isEmpty();
    }
}

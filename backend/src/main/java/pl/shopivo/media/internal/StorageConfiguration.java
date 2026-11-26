package pl.shopivo.media.internal;

import java.net.URI;
import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import pl.shopivo.media.ObjectStorage;
import pl.shopivo.media.StorageProperties;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

@Configuration(proxyBeanMethods = false)
class StorageConfiguration {

    @Bean(destroyMethod = "")
    ObjectStorage objectStorage(StorageProperties p, Environment environment) {
        if ("s3".equalsIgnoreCase(p.type())) {
            if (p.bucket() == null || p.accessKey() == null || p.secretKey() == null) {
                throw new IllegalStateException("shopivo.storage: bucket, access-key and secret-key are required for s3");
            }
            var builder = S3Client.builder()
                    .region(Region.of("auto".equals(p.region()) ? "us-east-1" : p.region()))
                    .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(p.accessKey(), p.secretKey())))
                    .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(p.pathStyle()).build())
                    // Bounded: a slow or unreachable bucket must not pin request threads indefinitely.
                    .overrideConfiguration(o -> o.apiCallTimeout(java.time.Duration.ofSeconds(30))
                            .apiCallAttemptTimeout(java.time.Duration.ofSeconds(10)));
            if (p.endpoint() != null && !p.endpoint().isBlank()) builder.endpointOverride(URI.create(p.endpoint()));
            return new S3ObjectStorage(builder.build(), p.bucket());
        }
        if (environment.matchesProfiles("prod | production | staging")) {
            throw new IllegalStateException("Local media storage is not allowed in " + String.join(",", environment.getActiveProfiles())
                    + " — configure shopivo.storage.type=s3");
        }
        return new LocalObjectStorage(Path.of(p.localDir()));
    }
}

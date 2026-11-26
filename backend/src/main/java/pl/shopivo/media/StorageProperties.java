package pl.shopivo.media;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** {@code shopivo.storage.*} — where media files are kept. */
@ConfigurationProperties(prefix = "shopivo.storage")
public record StorageProperties(
        /** {@code s3} (production) or {@code local} (development, tests). */
        @DefaultValue("local") String type,
        @DefaultValue("./data/media") String localDir,
        String endpoint,
        @DefaultValue("auto") String region,
        String bucket,
        String accessKey,
        String secretKey,
        @DefaultValue("true") boolean pathStyle) {
}

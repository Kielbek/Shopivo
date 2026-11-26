package pl.shopivo.media.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.media.ObjectStorage;
import pl.shopivo.shared.error.NotFoundException;

/**
 * Public image variants (product photos are public by nature). Only the generated JPEG variants are reachable — the
 * key is built from validated UUIDs and a fixed variant list, never from free text. Immutable: a new upload gets a
 * new id, so responses can be cached for a year (CDN in front in production).
 */
@RestController
@Tag(name = "Media")
class MediaController {

    private final ObjectStorage storage;

    MediaController(ObjectStorage storage) {
        this.storage = storage;
    }

    @GetMapping("/api/v1/media/{tenantId}/{imageId}/{variant:w400|w1200}.jpg")
    ResponseEntity<byte[]> image(@PathVariable UUID tenantId, @PathVariable UUID imageId, @PathVariable String variant) {
        byte[] data = storage.get("t/" + tenantId + "/" + imageId + "/" + variant + ".jpg").orElseThrow(NotFoundException::new);
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .header("X-Content-Type-Options", "nosniff")
                .body(data);
    }
}

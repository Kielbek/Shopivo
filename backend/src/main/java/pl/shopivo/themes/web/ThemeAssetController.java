package pl.shopivo.themes.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import pl.shopivo.themes.ThemeAssets;

/** Public, immutable template images (only files registered in {@link ThemeAssets} — no path is built from input). */
@RestController
@Tag(name = "Themes")
class ThemeAssetController {

    @GetMapping("/api/v1/theme-assets/{template:[a-z0-9]{2,20}}/{file:[a-z0-9-]{2,60}\\.jpg}")
    ResponseEntity<Resource> asset(@PathVariable String template, @PathVariable String file) {
        return ThemeAssets.resource(template, file)
                .map(ClassPathResource::new)
                .filter(Resource::exists)
                .<ResponseEntity<Resource>>map(r -> ResponseEntity.ok()
                        .contentType(MediaType.IMAGE_JPEG)
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                        .header("X-Content-Type-Options", "nosniff")
                        .body(r))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}

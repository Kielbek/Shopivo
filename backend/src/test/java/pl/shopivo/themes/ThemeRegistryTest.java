package pl.shopivo.themes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

class ThemeRegistryTest {

    @Test
    void onlyCurrentTemplatesAreOfferedAndRetiredOnesMapToASuccessor() {
        assertThat(ThemeRegistry.PRESETS).extracting(ThemeRegistry.Preset::code).containsExactly("VERA", "BAWILOO", "VELMIRA", "LULLORA");
        assertThat(ThemeRegistry.current("BEAUTY")).isEqualTo("VELMIRA");
        assertThat(ThemeRegistry.preset(ThemeRegistry.DEFAULT_CODE)).isPresent();
        assertThat(ThemeRegistry.current("TOYS")).isEqualTo("BAWILOO");
        assertThat(ThemeRegistry.current("JEWELRY")).isEqualTo("VERA");
        assertThat(ThemeRegistry.current("VERA")).isEqualTo("VERA");
        for (String successor : ThemeRegistry.RETIRED.values()) assertThat(ThemeRegistry.preset(successor)).as(successor).isPresent();
        // A retired configuration keeps the merchant's settings under its successor
        assertThat(ThemeRegistry.validate(ThemeRegistry.current("HOME"), Map.of("font", "serif", "primary", "#5B6E4F")))
                .containsEntry("font", "serif").containsEntry("primary", "#5B6E4F");
    }
}

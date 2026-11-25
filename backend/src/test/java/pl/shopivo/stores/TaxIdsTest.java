package pl.shopivo.stores;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TaxIdsTest {

    @Test
    void validatesPolishNip() {
        assertThat(TaxIds.isValidNip("5260250274")).isTrue();
        assertThat(TaxIds.isValidNip("526-025-02-74")).isTrue();
        assertThat(TaxIds.isValidNip("PL 526 025 02 74")).isTrue();
        assertThat(TaxIds.isValidNip("5260250275")).isFalse();
        assertThat(TaxIds.isValidNip("123")).isFalse();
        assertThat(TaxIds.isValidNip(null)).isFalse();
        assertThat(TaxIds.normalizeNip("PL526-025-02-74")).isEqualTo("5260250274");
    }
}

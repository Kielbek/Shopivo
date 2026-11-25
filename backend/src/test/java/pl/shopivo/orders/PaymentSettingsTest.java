package pl.shopivo.orders;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PaymentSettingsTest {

    @Test
    void validatesIbanChecksums() {
        assertThat(PaymentSettings.validIban("PL61109010140000071219812874")).isTrue();
        assertThat(PaymentSettings.validIban("PL61109010140000071219812875")).isFalse();
        assertThat(PaymentSettings.validIban("PL6110901014000007121981287")).isFalse(); // too short for PL
        assertThat(PaymentSettings.validIban("DE89370400440532013000")).isTrue();
    }

    @Test
    void computesVatIncludedInGrossAmounts() {
        assertThat(OrderPlacement.includedVat(12300, 2300)).isEqualTo(2300);
        assertThat(OrderPlacement.includedVat(10800, 800)).isEqualTo(800);
        assertThat(OrderPlacement.includedVat(1000, 0)).isZero();
    }
}

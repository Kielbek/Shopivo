package pl.shopivo.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ProductsTest {

    @Test
    void validatesGtinCheckDigits() {
        assertThat(Products.validEan("5901234123457")).isTrue();  // EAN-13
        assertThat(Products.validEan("5901234123458")).isFalse();
        assertThat(Products.validEan("96385074")).isTrue();       // EAN-8
        assertThat(Products.validEan("036000291452")).isTrue();   // UPC-A
        assertThat(Products.validEan("12345")).isFalse();
    }

    @Test
    void csvCellsAreQuotedAndFormulaSafe() {
        assertThat(Products.cell("Koszulka \"Łódź\"")).isEqualTo("\"Koszulka \"\"Łódź\"\"\"");
        assertThat(Products.cell("=1+1")).isEqualTo("\"'=1+1\"");
        assertThat(Products.cell("@SUM(A1)")).isEqualTo("\"'@SUM(A1)\"");
        assertThat(Products.cell("-12,50")).isEqualTo("\"-12,50\"");
        assertThat(Products.cell(null)).isEmpty();
    }
}

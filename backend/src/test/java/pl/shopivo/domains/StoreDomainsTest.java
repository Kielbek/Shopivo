package pl.shopivo.domains;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import pl.shopivo.shared.web.Slugs;

class StoreDomainsTest {

    @Test
    void validatesSubdomainLabels() {
        assertThat(StoreDomains.isValidSubdomainLabel("moj-sklep")).isTrue();
        assertThat(StoreDomains.isValidSubdomainLabel("abc")).isTrue();
        assertThat(StoreDomains.isValidSubdomainLabel("ab")).isFalse();
        assertThat(StoreDomains.isValidSubdomainLabel("-sklep")).isFalse();
        assertThat(StoreDomains.isValidSubdomainLabel("sklep-")).isFalse();
        assertThat(StoreDomains.isValidSubdomainLabel("sk--lep")).isFalse();
        assertThat(StoreDomains.isValidSubdomainLabel("Sklep")).isFalse();
        assertThat(StoreDomains.isValidSubdomainLabel("admin")).isFalse();
        assertThat(StoreDomains.isValidSubdomainLabel("a".repeat(41))).isFalse();
    }

    @Test
    void slugifiesPolishNames() {
        assertThat(Slugs.slugify("Łódzka Kawiarnia & Ciasta!")).isEqualTo("lodzka-kawiarnia-ciasta");
        assertThat(Slugs.slugify("  Zażółć gęślą jaźń ")).isEqualTo("zazolc-gesla-jazn");
    }
}

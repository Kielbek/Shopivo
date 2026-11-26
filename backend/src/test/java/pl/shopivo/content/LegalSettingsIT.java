package pl.shopivo.content;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** Document facts (shipping time, effective date, returns address, tools) fill the legal templates; markers report gaps. */
class LegalSettingsIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t;
    }

    @Test
    void settingsFillTheTemplatesAndMissingDataIsReported() {
        ApiClient owner = registeredUser(uniqueEmail("prawo"));
        String t = createStore(owner, "Pracownia", uniqueSlug("prawo"));
        var settings = owner.get(base(t) + "/store/settings").json();
        owner.put(base(t) + "/store/settings", Map.of("legalCompanyName", "Pracownia Anna Nowak", "taxId", "5260001246",
                "addressLine1", "ul. Długa 5", "postalCode", "31-001", "city", "Kraków", "countryCode", "PL",
                "orderEmail", "sklep@pracownia.example", "pricesIncludeTax", true, "version", settings.get("version").asLong()));

        // Before the settings: the template asks for shipping time and the effective date
        var before = owner.get(base(t) + "/content/legal/TERMS/template").json();
        assertThat(before.get("missing").toString()).contains("termin wysyłki", "data obowiązywania");
        assertThat(owner.get(base(t) + "/content/legal/settings").json().get("version").asLong()).isEqualTo(-1);

        var saved = owner.put(base(t) + "/content/legal/settings", Map.of("shippingTime", "do 2 dni roboczych",
                "effectiveDate", "2026-12-01", "returnsAddress", "Magazyn, ul. Krótka 1, 30-001 Kraków", "analyticsTools", "Google Analytics",
                "version", -1));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        long version = saved.json().get("version").asLong();

        var terms = owner.get(base(t) + "/content/legal/TERMS/template").json();
        assertThat(terms.get("body").asString()).contains("Termin wysyłki: do 2 dni roboczych", "obowiązuje od dnia 1.12.2026", "Magazyn, ul. Krótka 1");
        assertThat(terms.get("missing").size()).isZero();
        var privacy = owner.get(base(t) + "/content/legal/PRIVACY/template").json().get("body").asString();
        assertThat(privacy).contains("Google Analytics", "za Twoją zgodą").doesNotContain("Nie używamy plików cookies analitycznych");
        assertThat(owner.get(base(t) + "/content/legal/RETURNS/template").json().get("body").asString()).contains("Odeślij towar w ciągu 14 dni na adres: Magazyn");

        // An existing document reports what is still missing in its own text
        owner.post(base(t) + "/content/legal/SHIPPING", Map.of());
        var legal = owner.get(base(t) + "/content/legal").json();
        for (var l : legal) {
            if (l.get("key").asString().equals("SHIPPING")) assertThat(l.get("missing").size()).isZero();
        }

        // Stale version, brackets and an absurd date are refused
        assertThat(owner.put(base(t) + "/content/legal/settings", Map.of("shippingTime", "24 h", "version", version + 5)).code()).isEqualTo("VERSION_CONFLICT");
        assertThat(owner.put(base(t) + "/content/legal/settings", Map.of("shippingTime", "[x]", "version", version)).status()).isEqualTo(422);
        assertThat(owner.put(base(t) + "/content/legal/settings", Map.of("effectiveDate", "1990-01-01", "version", version)).status()).isEqualTo(422);
        Map<String, Object> clear = new HashMap<>();
        clear.put("version", version);
        assertThat(owner.put(base(t) + "/content/legal/settings", clear).json().get("shippingTime").isNull()).isTrue();

        // Another store sees nothing and cannot write
        ApiClient other = registeredUser(uniqueEmail("obcy"));
        assertThat(other.get(base(t) + "/content/legal/settings").status()).isEqualTo(404);
        assertThat(other.put(base(t) + "/content/legal/settings", Map.of("shippingTime", "x", "version", -1)).status()).isEqualTo(404);
    }
}

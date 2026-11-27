package pl.shopivo.customers;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import pl.shopivo.support.ApiClient;
import pl.shopivo.support.IntegrationTest;

/** Customers managed in the panel: create, edit, consent history, tags, import/export, permissions and tenant isolation. */
class CustomersIT extends IntegrationTest {

    private static String base(String t) {
        return "/api/v1/tenants/" + t + "/customers";
    }

    private static Map<String, Object> input(String email, boolean marketing, List<String> tags, Map<String, Object> address) {
        Map<String, Object> m = new HashMap<>();
        m.put("email", email);
        m.put("firstName", "Anna");
        m.put("lastName", "Nowak");
        m.put("phone", "+48 600 100 200");
        m.put("acceptsMarketing", marketing);
        m.put("note", "Stała klientka");
        m.put("address", address);
        m.put("tags", tags);
        return m;
    }

    private static Map<String, Object> address() {
        return Map.of("company", "", "line1", "ul. Długa 5/2", "line2", "", "postalCode", "00-001", "city", "Warszawa", "countryCode", "pl");
    }

    @Test
    void createEditConsentAndTags() {
        ApiClient owner = registeredUser(uniqueEmail("cust"));
        String t = createStore(owner, "Sklep Klienci", uniqueSlug("cust"));

        var created = owner.post(base(t), input("anna@example.com", true, List.of("VIP", " vip ", "hurt"), address()));
        assertThat(created.status()).isEqualTo(201);
        var c = created.json();
        assertThat(c.get("tags").size()).isEqualTo(2);
        assertThat(c.get("marketingConsentSource").asString()).isEqualTo("PANEL");
        assertThat(c.get("marketingConsentAt").isNull()).isFalse();
        assertThat(c.get("address").get("countryCode").asString()).isEqualTo("PL");
        assertThat(c.get("address").get("company").isNull()).isTrue();
        String id = c.get("id").asString();

        // Same e-mail (any case) → 409; invalid data → 422
        assertThat(owner.post(base(t), input("ANNA@example.com", false, List.of(), null)).status()).isEqualTo(409);
        assertThat(owner.post(base(t), input("nie-mail", false, List.of(), null)).status()).isEqualTo(422);
        assertThat(owner.post(base(t), input("b@example.com", false, List.of(), Map.of("city", "Kraków"))).code()).isEqualTo("ADDRESS_INCOMPLETE");

        // Withdrawing the consent clears its date and source; stale version → 409
        var edited = owner.put(base(t) + "/" + id, Map.of("customer", input("anna.nowak@example.com", false, List.of("VIP"), null), "version", 0));
        assertThat(edited.status()).isEqualTo(200);
        assertThat(edited.json().get("acceptsMarketing").asBoolean()).isFalse();
        assertThat(edited.json().get("marketingConsentAt").isNull()).isTrue();
        assertThat(edited.json().get("marketingConsentSource").isNull()).isTrue();
        assertThat(edited.json().get("address").get("line1").isNull()).isTrue();
        assertThat(owner.put(base(t) + "/" + id, Map.of("customer", input("x@example.com", false, List.of(), null), "version", 0)).status()).isEqualTo(409);

        // Search by tag and by city, tag filter
        owner.post(base(t), input("jan@example.com", false, List.of("hurt"), address()));
        assertThat(owner.get(base(t) + "?q=warszawa").json().get("totalItems").asInt()).isEqualTo(1);
        assertThat(owner.get(base(t) + "?tag=VIP").json().get("totalItems").asInt()).isEqualTo(1);
        assertThat(owner.get(base(t) + "/tags").json().size()).isEqualTo(2);

        // Bulk tag: the customer who already has it is not changed
        var all = owner.get(base(t)).json().get("items");
        List<String> ids = List.of(all.get(0).get("id").asString(), all.get(1).get("id").asString());
        var tagged = owner.post(base(t) + "/tags", Map.of("ids", ids, "tag", "vip"));
        assertThat(tagged.json().get("changed").asInt()).isEqualTo(1);
        assertThat(owner.get(base(t) + "?tag=vip").json().get("totalItems").asInt()).isEqualTo(2);

        // Export (selected) uses the import columns and guards formulas
        var csv = owner.post(base(t) + "/export.csv", Map.of("ids", List.of(id)));
        assertThat(csv.status()).isEqualTo(200);
        assertThat(csv.body()).startsWith("﻿email;imie;nazwisko").contains("anna.nowak@example.com", "\"'+48 600 100 200\"")
                .doesNotContain("jan@example.com");

        // Another store and roles without customer access see nothing
        ApiClient other = registeredUser(uniqueEmail("cust-obcy"));
        createStore(other, "Obcy", uniqueSlug("cust-obcy"));
        assertThat(other.get(base(t) + "/" + id).status()).isEqualTo(404);
        assertThat(other.post(base(t), input("z@example.com", false, List.of(), null)).status()).isEqualTo(404);
        String pmEmail = uniqueEmail("cust-pm");
        ApiClient pm = registeredUser(pmEmail);
        owner.post("/api/v1/tenants/" + t + "/invitations", Map.of("email", pmEmail, "role", "ORDER_MANAGER"));
        pm.post("/api/v1/invitations/accept", Map.of("token", emails.awaitToken(pmEmail, "Zaproszenie")));
        assertThat(pm.get(base(t)).status()).isEqualTo(200);
        assertThat(pm.post(base(t), input("q@example.com", false, List.of(), null)).status()).isEqualTo(403);
        assertThat(pm.post(base(t) + "/export.csv", Map.of()).status()).isEqualTo(403);
    }

    @Test
    void importCreatesUpdatesAndRecordsConsentOnlyWhenConfirmed() {
        ApiClient owner = registeredUser(uniqueEmail("imp"));
        String t = createStore(owner, "Sklep Import", uniqueSlug("imp"));
        owner.post(base(t), input("stara@example.com", false, List.of("stały"), null));

        String file = """
                ﻿E-mail,Imię,Nazwisko,Telefon,Miasto,Kod pocztowy,Adres,Tagi,Zgoda marketingowa
                nowa@example.com,Ewa,"Kowalska, z d. Nowak",'+48500600700,Gdańsk,80-001,ul. Morska 1,"hurt, vip",tak
                STARA@example.com,,Zmieniona,,,,,"hurt",tak
                zly-adres,Jan,,,,,,,
                bez@example.com,Ola,,,Kraków,,,,nie
                ,,,,,,,,
                """;
        var r = owner.upload(base(t) + "/import", file.getBytes(StandardCharsets.UTF_8), "klienci.csv", "text/csv");
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.json().get("created").asInt()).isEqualTo(1);
        assertThat(r.json().get("updated").asInt()).isEqualTo(1);
        assertThat(r.json().get("skipped").asInt()).isEqualTo(2);
        assertThat(r.json().get("errors").get(0).asString()).startsWith("Wiersz 4");

        var nowa = owner.get(base(t) + "?q=nowa@").json().get("items").get(0);
        assertThat(nowa.get("lastName").asString()).isEqualTo("Kowalska, z d. Nowak");
        assertThat(nowa.get("phone").asString()).isEqualTo("+48500600700");
        assertThat(nowa.get("address").get("city").asString()).isEqualTo("Gdańsk");
        assertThat(nowa.get("tags").size()).isEqualTo(2);
        // Without the merchant's confirmation the consent column is ignored
        assertThat(nowa.get("acceptsMarketing").asBoolean()).isFalse();

        var stara = owner.get(base(t) + "?q=stara@").json().get("items").get(0);
        assertThat(stara.get("firstName").asString()).isEqualTo("Anna");
        assertThat(stara.get("lastName").asString()).isEqualTo("Zmieniona");
        assertThat(stara.get("tags").size()).isEqualTo(2);

        var confirmed = owner.upload(base(t) + "/import?consentConfirmed=true",
                "email;zgoda_marketingowa\nnowa@example.com;tak\n".getBytes(StandardCharsets.UTF_8), "z.csv", "text/csv");
        assertThat(confirmed.json().get("updated").asInt()).isEqualTo(1);
        var withConsent = owner.get(base(t) + "?q=nowa@").json().get("items").get(0);
        assertThat(withConsent.get("acceptsMarketing").asBoolean()).isTrue();
        assertThat(withConsent.get("marketingConsentSource").asString()).isEqualTo("IMPORT");

        assertThat(owner.upload(base(t) + "/import", "imie;nazwisko\nA;B\n".getBytes(StandardCharsets.UTF_8), "x.csv", "text/csv").code())
                .isEqualTo("IMPORT_NO_EMAIL");
        assertThat(owner.get(base(t)).json().get("totalItems").asInt()).isEqualTo(2);
    }
}

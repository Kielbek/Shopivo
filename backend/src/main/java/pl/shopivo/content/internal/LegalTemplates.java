package pl.shopivo.content.internal;

import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.time.format.DateTimeFormatter;
import pl.shopivo.content.LegalKey;
import pl.shopivo.content.LegalSettings;
import pl.shopivo.stores.StoreSettingsView;
import pl.shopivo.stores.StoreView;
import pl.shopivo.stores.Stores;

/**
 * Starting points for a store's legal documents under Polish consumer law, filled with the store's data. They are
 * created as drafts: the merchant reviews (ideally with a lawyer) and adapts them before publishing — the panel says so.
 * Missing data is left as a visible "[uzupełnij: …]" marker instead of being invented.
 */
@Component
public class LegalTemplates {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d.MM.yyyy");

    private final Stores stores;
    private final LegalSettings legal;
    private final String urlTemplate;

    LegalTemplates(Stores stores, LegalSettings legal, @Value("${shopivo.storefront-url-template:https://{host}}") String urlTemplate) {
        this.stores = stores;
        this.legal = legal;
        this.urlTemplate = urlTemplate;
    }

    public String render(LegalKey key) {
        StoreView store = stores.current();
        StoreSettingsView s = stores.currentSettings();
        LegalSettings.View l = legal.current();
        String address = or(Stream.of(s.addressLine1(), s.addressLine2(), join(s.postalCode(), s.city()))
                .filter(x -> x != null && !x.isBlank()).collect(Collectors.joining(", ")), "adres firmy");
        Data d = new Data(
                or(s.legalCompanyName(), "nazwa firmy"),
                or(s.taxId(), "NIP"),
                address,
                or(s.orderEmail() != null ? s.orderEmail() : store.contactEmail(), "adres e-mail"),
                s.phone() == null || s.phone().isBlank() ? null : s.phone(),
                urlTemplate.replace("{host}", store.primaryHostname()),
                store.name(),
                or(l.shippingTime(), "termin wysyłki, np. do 2 dni roboczych od zaksięgowania płatności"),
                l.effectiveDate() == null ? "[uzupełnij: data obowiązywania]" : l.effectiveDate().format(DATE),
                l.returnsAddress() == null ? address : l.returnsAddress(),
                l.analyticsTools(), l.marketingTools());
        return switch (key) {
            case TERMS -> terms(d);
            case PRIVACY -> privacy(d);
            case RETURNS -> returns(d);
            case SHIPPING -> shipping(d);
        };
    }

    record Data(String company, String taxId, String address, String email, String phone, String url, String storeName,
            String shippingTime, String effectiveDate, String returnsAddress, String analyticsTools, String marketingTools) {
        String contact() {
            return "e-mail: " + email + (phone == null ? "" : ", tel. " + phone);
        }
    }

    private static String terms(Data d) {
        return """
                ## § 1. Postanowienia ogólne

                1. Sklep internetowy %s, dostępny pod adresem %s, prowadzi %s, %s, NIP %s (dalej: „Sprzedawca”).
                2. Kontakt ze Sprzedawcą: %s.
                3. Regulamin określa zasady zawierania umów sprzedaży za pośrednictwem sklepu, prawa i obowiązki stron oraz tryb składania reklamacji i odstępowania od umowy.

                ## § 2. Definicje

                - **Konsument** – osoba fizyczna zawierająca ze Sprzedawcą umowę niezwiązaną bezpośrednio z jej działalnością gospodarczą lub zawodową.
                - **Przedsiębiorca na prawach konsumenta** – osoba fizyczna zawierająca umowę bezpośrednio związaną z jej działalnością gospodarczą, gdy z treści umowy wynika, że nie ma ona dla niej charakteru zawodowego (w szczególności w świetle przedmiotu działalności wpisanego do CEIDG).
                - **Klient** – osoba składająca zamówienie w sklepie.
                - **Umowa sprzedaży** – umowa zawarta między Klientem a Sprzedawcą na odległość, za pośrednictwem sklepu.

                ## § 3. Wymagania techniczne

                Do korzystania ze sklepu potrzebne są: urządzenie z dostępem do internetu, aktualna przeglądarka internetowa z włączoną obsługą JavaScript oraz aktywny adres e-mail.

                ## § 4. Składanie zamówień i zawarcie umowy

                1. Klient wybiera produkty, dodaje je do koszyka, podaje dane do dostawy, wybiera sposób dostawy i płatności, akceptuje regulamin i klika przycisk „Zamawiam i płacę”.
                2. Przed złożeniem zamówienia Klient widzi łączną cenę produktów wraz z podatkami oraz koszty dostawy.
                3. Umowa sprzedaży zostaje zawarta z chwilą wysłania Klientowi na podany adres e-mail potwierdzenia przyjęcia zamówienia.

                ## § 5. Ceny i płatności

                1. Ceny podane w sklepie są cenami brutto (zawierają podatek VAT) wyrażonymi w złotych polskich. Koszty dostawy są podawane przed złożeniem zamówienia.
                2. Przy obniżce ceny sklep podaje także najniższą cenę produktu z 30 dni przed obniżką.
                3. Dostępne metody płatności są prezentowane podczas składania zamówienia. Przy płatności przelewem tradycyjnym termin płatności wskazany jest w potwierdzeniu zamówienia; po jego upływie zamówienie może zostać anulowane.

                ## § 6. Dostawa

                1. Sprzedawca realizuje dostawy na terenie Polski. Dostępne sposoby i koszty dostawy są prezentowane podczas składania zamówienia.
                2. Termin wysyłki: %s.

                ## § 7. Prawo odstąpienia od umowy

                1. Konsument oraz przedsiębiorca na prawach konsumenta może odstąpić od umowy w terminie 14 dni bez podawania przyczyny. Termin biegnie od objęcia rzeczy w posiadanie przez Klienta lub wskazaną przez niego osobę inną niż przewoźnik.
                2. Aby odstąpić od umowy, wystarczy przed upływem terminu wysłać Sprzedawcy oświadczenie, np. na adres %s lub pocztą na adres %s. Można skorzystać ze wzoru formularza dostępnego na stronie „Zwroty i reklamacje”, nie jest to jednak obowiązkowe.
                3. Sprzedawca zwraca wszystkie płatności, w tym koszty dostawy (z wyjątkiem dodatkowych kosztów wynikających z wybranego przez Klienta sposobu dostawy innego niż najtańszy zwykły sposób oferowany przez Sprzedawcę), niezwłocznie, nie później niż w terminie 14 dni od dnia otrzymania oświadczenia o odstąpieniu. Zwrot następuje tym samym sposobem płatności, jakiego użył Klient, chyba że Klient zgodzi się na inny sposób niewiążący się z kosztami.
                4. Sprzedawca może wstrzymać się ze zwrotem płatności do chwili otrzymania rzeczy z powrotem lub dostarczenia dowodu jej odesłania, w zależności od tego, które zdarzenie nastąpi wcześniej.
                5. Klient odsyła rzecz niezwłocznie, nie później niż w terminie 14 dni od dnia odstąpienia od umowy, i ponosi bezpośrednie koszty jej zwrotu.
                6. Klient odpowiada za zmniejszenie wartości rzeczy wynikające z korzystania z niej w sposób wykraczający poza konieczny do stwierdzenia jej charakteru, cech i funkcjonowania.
                7. Prawo odstąpienia nie przysługuje w przypadkach wskazanych w art. 38 ustawy z dnia 30 maja 2014 r. o prawach konsumenta, m.in. dla rzeczy wyprodukowanych według specyfikacji Klienta, szybko psujących się oraz dostarczanych w zapieczętowanym opakowaniu, których po otwarciu nie można zwrócić ze względów higienicznych, jeżeli opakowanie zostało otwarte.

                ## § 8. Reklamacje

                1. Sprzedawca odpowiada wobec konsumenta i przedsiębiorcy na prawach konsumenta za zgodność towaru z umową na zasadach określonych w ustawie o prawach konsumenta.
                2. Reklamację można złożyć na adres %s lub pocztą na adres %s. Prosimy o opis problemu, numer zamówienia i oczekiwany sposób rozpatrzenia (naprawa, wymiana, obniżenie ceny lub odstąpienie od umowy).
                3. Sprzedawca odpowiada na reklamację w terminie 14 dni od jej otrzymania.

                ## § 9. Pozasądowe sposoby rozpatrywania sporów

                Konsument może skorzystać z pomocy miejskiego lub powiatowego rzecznika konsumentów, wojewódzkiego inspektoratu Inspekcji Handlowej lub organizacji konsumenckich. Informacje są dostępne na stronie Urzędu Ochrony Konkurencji i Konsumentów (uokik.gov.pl).

                ## § 10. Dane osobowe

                Zasady przetwarzania danych osobowych opisuje [Polityka prywatności](/strona/polityka-prywatnosci).

                ## § 11. Postanowienia końcowe

                1. W sprawach nieuregulowanych stosuje się przepisy prawa polskiego, w szczególności Kodeksu cywilnego i ustawy o prawach konsumenta.
                2. Zmiana regulaminu nie dotyczy zamówień złożonych przed jej wejściem w życie.
                3. Regulamin obowiązuje od dnia %s.
                """.formatted(d.storeName(), d.url(), d.company(), d.address(), d.taxId(), d.contact(), d.shippingTime(), d.email(),
                d.returnsAddress(), d.email(), d.address(), d.effectiveDate());
    }

    private static String privacy(Data d) {
        return """
                ## Administrator danych

                Administratorem Twoich danych osobowych jest %s, %s, NIP %s. Kontakt w sprawach danych osobowych: %s.

                ## Jakie dane i w jakim celu przetwarzamy

                - **Realizacja zamówienia** (imię, nazwisko, adres, e-mail, telefon, dane do faktury) – podstawa: zawarcie i wykonanie umowy (art. 6 ust. 1 lit. b RODO).
                - **Rozliczenia i księgowość** – podstawa: obowiązek prawny wynikający z przepisów podatkowych i rachunkowych (art. 6 ust. 1 lit. c RODO).
                - **Reklamacje, odstąpienia od umowy i ewentualne roszczenia** – podstawa: nasz prawnie uzasadniony interes (art. 6 ust. 1 lit. f RODO).
                - **Informacje marketingowe e-mailem** – tylko jeśli wyrazisz zgodę (art. 6 ust. 1 lit. a RODO). Zgodę możesz w każdej chwili wycofać.

                ## Komu przekazujemy dane

                Dane mogą otrzymać podmioty, które pomagają nam prowadzić sklep: dostawca platformy sklepu i hostingu (Shopivo – jako podmiot przetwarzający), firmy kurierskie i operatorzy pocztowi, operatorzy płatności, biuro rachunkowe. Nie sprzedajemy Twoich danych.

                ## Jak długo przechowujemy dane

                - dane zamówień – przez okres wymagany przepisami podatkowymi (co do zasady 5 lat od końca roku podatkowego),
                - dane potrzebne do obsługi reklamacji i roszczeń – do upływu terminów przedawnienia,
                - dane przetwarzane na podstawie zgody – do jej wycofania.

                ## Twoje prawa

                Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia, wniesienia sprzeciwu oraz wycofania zgody w dowolnym momencie (bez wpływu na zgodność z prawem przetwarzania przed jej wycofaniem). Przysługuje Ci też prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych.

                ## Czy musisz podać dane

                Podanie danych jest dobrowolne, ale niezbędne do złożenia i realizacji zamówienia. Nie podejmujemy decyzji w sposób zautomatyzowany ani nie profilujemy Klientów.

                ## Pliki cookies i pamięć przeglądarki

                %s
                """.formatted(d.company(), d.address(), d.taxId(), d.contact(), cookies(d));
    }

    /** The cookies section depends on the tools the store actually uses — nothing is claimed that is not configured. */
    private static String cookies(Data d) {
        String base = "Sklep zapisuje w pamięci Twojej przeglądarki informacje niezbędne do działania koszyka i potwierdzenia zamówienia.";
        if (d.analyticsTools() == null && d.marketingTools() == null) {
            return base + " Nie używamy plików cookies analitycznych ani reklamowych.";
        }
        StringBuilder sb = new StringBuilder(base);
        if (d.analyticsTools() != null) {
            sb.append("\n\n**Statystyka:** korzystamy z narzędzi ").append(d.analyticsTools())
                    .append(", aby wiedzieć, jak klienci korzystają ze sklepu. Pliki cookies tych narzędzi zapisujemy tylko za Twoją zgodą (art. 6 ust. 1 lit. a RODO).");
        }
        if (d.marketingTools() != null) {
            sb.append("\n\n**Reklama:** korzystamy z narzędzi ").append(d.marketingTools())
                    .append(", aby pokazywać reklamy naszych produktów. Pliki cookies tych narzędzi zapisujemy tylko za Twoją zgodą, którą możesz w każdej chwili wycofać.");
        }
        return sb.toString();
    }

    private static String returns(Data d) {
        return """
                ## Zwrot towaru (odstąpienie od umowy)

                Masz 14 dni na odstąpienie od umowy bez podawania przyczyny, licząc od dnia otrzymania przesyłki.

                1. Wyślij nam oświadczenie o odstąpieniu od umowy na adres %s (możesz użyć wzoru poniżej).
                2. Odeślij towar w ciągu 14 dni na adres: %s.
                3. Zwrot pieniędzy otrzymasz w ciągu 14 dni od otrzymania oświadczenia (możemy wstrzymać się ze zwrotem do czasu otrzymania towaru lub dowodu jego nadania).

                Szczegóły opisuje § 7 [regulaminu](/strona/regulamin).

                ## Reklamacje

                Jeśli towar jest niezgodny z umową, napisz na %s lub wyślij reklamację na adres %s. Podaj numer zamówienia, opis problemu i oczekiwane rozwiązanie. Odpowiemy w ciągu 14 dni.

                ## Wzór formularza odstąpienia od umowy

                (formularz ten należy wypełnić i odesłać tylko w przypadku chęci odstąpienia od umowy)

                Adresat: %s, %s, %s

                Ja/My(*) niniejszym informuję/informujemy(*) o moim/naszym(*) odstąpieniu od umowy sprzedaży następujących rzeczy(*) / umowy dostawy następujących rzeczy(*) / umowy o dzieło polegającej na wykonaniu następujących rzeczy(*) / o świadczenie następującej usługi(*):

                - Data zawarcia umowy(*) / odbioru(*):
                - Imię i nazwisko konsumenta(-ów):
                - Adres konsumenta(-ów):
                - Podpis konsumenta(-ów) (tylko jeżeli formularz jest przesyłany w wersji papierowej):
                - Data:

                (*) Niepotrzebne skreślić.
                """.formatted(d.email(), d.returnsAddress(), d.email(), d.address(), d.company(), d.address(), d.email());
    }

    private static String shipping(Data d) {
        return """
                ## Dostawa

                Wysyłamy zamówienia na terenie Polski. Dostępne sposoby dostawy i ich koszty widzisz w koszyku i podczas składania zamówienia – zanim je potwierdzisz.

                Termin wysyłki: %s.

                ## Płatności

                Dostępne metody płatności są widoczne podczas składania zamówienia. Przy przelewie tradycyjnym dane do przelewu otrzymasz na stronie potwierdzenia i w e-mailu z potwierdzeniem zamówienia.

                ## Masz pytania?

                Napisz do nas: %s.
                """.formatted(d.shippingTime(), d.contact());
    }

    private static String or(String v, String what) {
        return v == null || v.isBlank() ? "[uzupełnij: " + what + "]" : v.strip();
    }

    private static String join(String postal, String city) {
        String r = ((postal == null ? "" : postal) + " " + (city == null ? "" : city)).strip();
        return r.isEmpty() ? null : r;
    }
}

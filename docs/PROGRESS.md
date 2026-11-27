# Shopivo — postęp prac

Ostatnia aktualizacja: 2026-11-27 · Ukończone: **Faza 0**, **Faza 1**, **Faza 2**, **Faza 3**, **Faza 4a**, **Faza 4b**, **Faza 4c — opinie**, **Faza 4d — konta klientów**, **Faza 4e — CAPTCHA i menu**, **Faza 5a — płatności online**, **Faza 5b — wysyłka InPost**, **usprawnienia UX katalogu**, **silnik wyglądu i newsletter**, **szablon Véra z grafikami szablonów** (z ograniczeniami opisanymi niżej).

## Wyniki testów (rzeczywiście uruchomione)

| Zestaw | Polecenie | Wynik |
|---|---|---|
| Backend — testy jednostkowe (surefire) | `cd backend && ./mvnw verify` | 49/49 ✔ (+1 pominięty: test S3 uruchamiany tylko z `SHOPIVO_TEST_S3_ENDPOINT`) |
| Backend — testy integracyjne (failsafe, Testcontainers PostgreSQL 17 + Redis 7) | jw. | 88/88 ✔ |
| Backend — `S3ObjectStorageTest` na serwerze zgodnym z S3 (moto) | `SHOPIVO_TEST_S3_ENDPOINT=… ./mvnw test -Dtest=S3ObjectStorageTest` | ✔ (uruchomiony ręcznie; MinIO niedostępne w tym środowisku) |
| Frontend — Vitest (3 aplikacje) | `cd frontend && npm test` | 81/81 ✔ (panel 67, admin 3, witryna 11) |
| Frontend — build produkcyjny 3 aplikacji | `npm run build` | ✔ (panel: 85 kB gzip initial) |
| `npm audit --omit=dev --audit-level=high` | | 0 podatności |
| Ręczny przepływ E2E w Chromium (Playwright, skrypt poza repo) na pełnym stosie lokalnym | rejestracja → e-mail (Mailpit) → weryfikacja → logowanie → sklep → dane firmy (walidacja NIP) → zaproszenie → MFA (QR) → panel admina → blokada sprzedawcy w panelu admina | ✔ |

Testy E2E w repozytorium (Playwright) — **jeszcze nie ma** (Faza 8).

| Ręczny przepływ E2E Fazy 2 (Playwright, poza repo) | admin konfiguruje i aktywuje operatora (symulator) → sprzedawca na okresie próbnym wybiera Starter → przekierowanie → podpisane powiadomienie → plan aktywny, płatność „Opłacona”; widok mobilny bez poziomego przewijania; strony admina (subskrypcje, plany, kupony, zużycie, MRR) | ✔ |

| Ręczny przepływ E2E Fazy 3 (Playwright, poza repo) | kategorie i marka → produkt z 3 wariantami w edytorze → obniżka z Omnibusem → korekta magazynu i historia → wysyłka i płatności w ustawieniach → zamówienie przez API storefrontu → opłacenie, wysyłka z numerem, notatka → zamówienie ręczne → karta klienta; widoki mobilne bez poziomego przewijania, 0 błędów konsoli | ✔ |

| Ręczny przepływ E2E Fazy 4a (Playwright, poza repo) | sprzedawca: produkty, kategorie, dostawa, przelew → 2 zdjęcia przez edytor produktu → „Wygląd sklepu”: preset Home, teksty, zapis szkicu → podgląd w nowej karcie (baner podglądu, szkic widoczny) → publikacja motywu → publikacja sklepu z karty na Przeglądzie; klient na `http://<sklep>.shopivo.localhost:4000`: strona główna → kategoria (Omnibus) → produkt (wariant niedostępny, wybór wariantu, galeria) → koszyk → checkout (walidacja, regulamin) → potwierdzenie z danymi do przelewu; SSR: tytuł, opis, canonical, OG, JSON-LD Product/BreadcrumbList, 404 dla nieznanego produktu/kategorii/sklepu, sitemap, robots; iPhone 13 bez poziomego przewijania; 0 błędów konsoli | ✔ |

## Strona szablonu z podglądem demo (2026-11-27)

- **Strona szablonu w panelu:** szczegóły, liczba sklepów korzystających z szablonu i żywy podgląd demo z przykładowymi produktami (komputer i telefon). Do tego „Otwórz w nowej karcie” i „Wybierz szablon”.
- **Demo:** osobne API z katalogiem szablonu (katalogi współdzielone między szablonami); koszyk, zamówienia i konta są wyłączone, strony mają noindex.
- **Edytor i sklep:** już bez przykładowych produktów, tylko produkty sprzedawcy.
- **E2E:**
  - galeria pokazuje licznik, strona szablonu ma podgląd z 14 produktami;
  - w demo przejście na stronę produktu działa, a „Dodaj do koszyka” pokazuje komunikat podglądu;
  - po wyborze edytor pokazuje 0 przykładów, a licznik wzrasta;
  - 0 błędów konsoli.

## Polecanie produktów (2026-11-27)

- **Moduł `recommendations` — gotowe listy** (`/storefront/collections/…`): bestsellery z wygaszaniem, promocje wg obniżki, ostatnie sztuki, najlepiej oceniane (średnia bayesowska), wróciły do sprzedaży i nowości, z filtrem kategorii.
- **Przy produkcie i w koszyku:**
  - „Często kupowane razem” — tylko prawdziwe pary, ze współczynnikiem osłabiającym bestsellery;
  - „Podobne”;
  - podpowiedzi do koszyka ułożone pod próg darmowej dostawy.
- **Witryna:**
  - nowe źródła w sekcji „Produkty”;
  - dwie sekcje na stronie produktu;
  - „Dodaj do zamówienia” w bocznym koszyku (z dodaniem jednym kliknięciem) i na stronie koszyka.
- **Testy i E2E:**
  - `RecommendationsIT` na prawdziwych zamówieniach: anulowane się nie liczą, promocje i ostatnie sztuki nie są „dopychane”, odświeżanie po zamówieniu;
  - E2E na Bawiloo: 4 zamówienia → bestsellery i „kupowane razem” zgodne z zamówieniami, „+ Dodaj” w koszyku, 0 błędów konsoli.
- **Opis:** [RECOMMENDATIONS.md](RECOMMENDATIONS.md). Etap 3 (personalizacja, statystyki) jeszcze nie jest zrobiony.

## Szablon Véra i grafiki szablonów (2026-11-27)

- **Grafiki szablonów jako odnośniki `tpl:<szablon>/<nazwa>`:**
  - pliki leżą przy kodzie (`resources/themes/`), są wspólne dla wszystkich sklepów i serwowane publicznie z cache;
  - edytor pokazuje je od razu, a sprzedawca może każde podmienić na własne (i przywrócić);
  - walidacja odrzuca nieznane odnośniki;
  - opis architektury: [THEMES.md](THEMES.md), licencje: [THEME_ASSETS.md](THEME_ASSETS.md).
- **Szablon Véra (pierwszy z własnym kodem):**
  - nagłówek, stopka i boczny koszyk z progiem darmowej dostawy;
  - karta produktu 3:4 z szybkim dodaniem do koszyka;
  - galeria strony produktu z pionowymi miniaturami;
  - samohostowane fonty Cormorant Garamond i Plus Jakarta Sans.
- **Nowe sekcje i opcje sekcji (dla wszystkich szablonów):**
  - „Kafelki ze zdjęciami” i „Baner na zdjęciu”;
  - baner „Magazyn” z drugim przyciskiem i kartą polecanego produktu;
  - nadtytuły;
  - filtry kategorii i sortowanie w sekcji produktów.
- **Przykładowe produkty szablonu:**
  - 8 produktów Véry widocznych tylko w podglądzie pustego sklepu; klienci ich nie widzą;
  - na życzenie można je dodać do sklepu jako zwykłe produkty (ze zdjęciami, rozmiarami i kategoriami);
  - miniatura Véry w galerii ma ciemny pasek, rozstrzelone logo, zdjęcia produktów i poprawiony widok telefonu;
  - E2E: pusty sklep → 8 przykładów i notka w podglądzie, zero przykładów na żywo → dodanie 8 produktów → podgląd pokazuje prawdziwe produkty; 0 błędów konsoli.
- **Szablon Bawiloo (zabawki, pierwsza, ciemna wersja):**
  - własny nagłówek, stopka i karta produktu; 24 grafiki; 16 przykładowych zabawek;
  - nowe opcje sekcji: baner „Radosny”, kafelki okrągłe z przyciskiem, druga linia nagłówka i opis, karuzela produktów, zdjęcie „kwiatek”, nadtytuły w obrazie z tekstem i newsletterze;
  - grafiki szablonu mogą być w WebP;
  - E2E: podgląd pustego sklepu pokazuje 14 przykładów → dodanie 16 produktów → strona sklepu: karuzela się przewija, „Do koszyka” otwiera boczny koszyk z progiem dostawy, telefon bez poziomego przewijania, 0 zapytań zewnętrznych, 0 błędów konsoli i HTTP.
- **Tylko dwa szablony: Véra i Bawiloo.**
  - Wycofane kody przechodzą na następcę razem z ustawieniami.
  - W Bawiloo „Ulubione zabawki dzieci” to prawdziwe kategorie w jednej linii z „Zobacz więcej”.
  - Przykładowe kategorie mają zdjęcia.
  - Miniatury w galerii: proporcje jak na stronie, ikony w nagłówku, falowana krawędź z łuków.
- **Jasne Bawiloo (nowy `index.html`, 2026-11-27):**
  - kremowe tło, białe karty, złoty nagłówek z ciemnym tekstem, stopka na kremowym tle;
  - kategorie jako zdjęcia bez tła (`cutouts`) w jednej linii z „Zobacz więcej”; grafiki kategorii wycięte z tła;
  - slider promocji z wyróżnionym produktem (`ui/spotlight-carousel.ts`): strzałki, kropki, klawiatura, przesuwanie, zapętlenie, komunikaty dla czytnika ekranu;
  - kolory tekstu dobierane do kontrastu (`--sf-on-accent`, `--sf-accent-ink`), więc działa też z kolorami sprzedawcy;
  - poprawka rekomendacji: pusta lista nie trafia do pamięci podręcznej (wcześniej w nowym sklepie bestsellery były puste przez 2 minuty po dodaniu produktów) — test `RecommendationsIT`;
  - E2E: szczegóły szablonu (8 slajdów w demo) → wybór → 16 przykładów → strona sklepu: slider (strzałka, ←, kropka, przesunięcie, klik w środek otwiera produkt), 6 kategorii z `multiply`, 6 bestsellerów, boczny koszyk; telefon: 3 kategorie → 6 po „Zobacz więcej”, bez poziomego przewijania; 0 błędów konsoli i 0 zapytań zewnętrznych.
  - Ograniczenie: sklepy z ciemnym Bawiloo zachowują zapisane kolory; jasna wersja po ponownym wyborze szablonu.
- **Poprawka:** lista produktów obsługuje `?promocje=tak`. Wcześniej linki „Promocje” z sekcji pokazywały wszystkie produkty.
- **E2E (Playwright, poza repo):**
  - **Przepływ:** sklep modowy z 8 produktami → wybór Véry w galerii → edytor → publikacja → strona główna (filtry: Akcesoria 2, Promocje 2) → szybkie dodanie produktu bez wariantów (boczny koszyk) → produkt z rozmiarami prowadzi na stronę produktu → dodanie z wyborem rozmiaru → `/produkty?promocje=tak`.
  - **Edytor:** podmiana zdjęcia banera na własne, zapis, przywrócenie zdjęcia szablonu.
  - **Wynik:** iPhone 13 bez poziomego przewijania, 0 błędów konsoli, 0 zapytań do zewnętrznych hostów (fonty z `/fonts`).
- **Ograniczenia:**
  - komponenty Véry są w paczce startowej witryny (+~40 kB, próg ostrzeżenia 600 kB); przy kolejnych szablonach — leniwe ładowanie;
  - kafelki z linkiem `https://` prowadzą do wszystkich produktów (obsługiwane są linki wewnętrzne);
  - pole „Wysokość” banera nie wpływa na układ „Magazyn”;
  - zdjęcia z HTML-a są z Unsplash — dobre jako start, ale sprzedawca powinien użyć własnych.

## Faza 4a — witryna sklepu i motywy (2026-11-26)

- **Pliki** (`media`): S3 (AWS/R2/MinIO) lub katalog lokalny (dev), zdjęcia produktów JPEG/PNG ≤ 10 MB, warianty
  400/1200 px, ochrona przed „bombami” obrazów, limit miejsca z planu, maks. 10 zdjęć na produkt.
- **Motywy** (`themes`): 8 presetów, ustawienia kolorów/kroju/zaokrągleń/układu/tekstów, szkic → podgląd (token 2 h)
  → publikacja; walidacja wszystkich wartości po stronie serwera.
- **Publikacja sklepu**: lista braków (dane sprzedawcy, produkt, dostawa, płatność), wyłączenie sklepu, blokada koszyka i
  checkoutu dla nieopublikowanego sklepu, blokada zmiany waluty po pierwszym produkcie/zamówieniu.
- **Witryna (Angular SSR)**: strona główna (3 układy), katalog/kategorie/wyszukiwarka z sortowaniem i stronicowaniem,
  karta produktu (galeria, warianty, dostępność, Omnibus), koszyk, checkout, potwierdzenie; stopka z danymi sprzedawcy;
  SEO (meta, canonical, OG, JSON-LD, sitemap, robots, prawdziwe kody 404/503), CSP.
- **Panel**: „Wygląd sklepu”, karta publikacji na Przeglądzie, zdjęcia w edytorze produktu, miniatury na liście produktów.
- Błędy znalezione w E2E i naprawione: kolory pochodne motywu (tło miniatur, obramowania) brały wartości domyślne
  zamiast motywu; krój pisma motywu nie był stosowany; nieistniejący produkt zwracał 200 zamiast 404 (odczyt zasobu w
  stanie błędu przerywał SSR); adresy w sitemap/robots budowane z wewnętrznego żądania (zły schemat/port) — teraz z
  `shopivo.storefront-url-template`.

| Ręczny przepływ E2E Fazy 4b (Playwright, poza repo) | panel: regulamin i polityka ze wzoru (ostrzeżenie, uzupełnienie, podgląd, publikacja) → wpis na blogu → przekierowanie → publikacja sklepu; klient: stopka → regulamin, blog → wpis, link do regulaminu w checkoucie, zamówienie; panel: podgląd wersji regulaminu zaakceptowanej w zamówieniu; `curl`: 301 ze starego adresu, 404 bez przekierowania, tytuł/opis SSR, JSON-LD `BlogPosting`; mobile bez poziomego przewijania, 0 błędów konsoli | ✔ |

| Ręczny przepływ E2E Fazy 4c (Playwright, poza repo) | zakup w sklepie → opłacenie, wysyłka, realizacja → e-mail z linkiem (Mailpit) → formularz opinii (token usunięty z paska adresu, walidacja oceny) → e-mail do sklepu → moderacja i odpowiedź w panelu → opinia, średnia, rozkład i „Zweryfikowany zakup” na karcie produktu; `curl`: JSON-LD `aggregateRating` w SSR; mobile bez poziomego przewijania; 0 błędów konsoli | ✔ |

| Ręczny przepływ E2E Fazy 4d (Playwright, poza repo) | rejestracja w sklepie (walidacja regulaminu) → e-mail (Mailpit) → aktywacja z hasłem (złe hasło odrzucone, token usunięty z adresu) → adres domyślny → checkout z danymi z konta → zamówienie widoczne na koncie → realizacja → opinia z konta („Do oceny”) → szczegóły zamówienia z numerem przesyłki → wylogowanie, złe hasło, logowanie → opinia w panelu; ciasteczko HttpOnly, SameSite=Lax, tylko domena sklepu; mobile bez poziomego przewijania | ✔ |

| Ręczny przepływ E2E Fazy 4e (Playwright, poza repo; Cloudflare niedostępny z tego środowiska — skrypt widgetu podstawiony w przeglądarce, backend z Turnstile wskazującym na lokalny serwer weryfikacji) | menu w panelu (wybór kategorii, własny adres odrzucony dla zewnętrznego URL, zmiana nazwy, kolejność, zapis) → menu w nagłówku sklepu → checkout: brak potwierdzenia blokowany w przeglądarce, token bota odrzucony przez serwer (400), token człowieka → zamówienie; rejestracja z CAPTCHA → aktywacja → oznaczenie „Konto” w panelu Klienci | ✔ |

| Ręczny przepływ E2E Fazy 5a (Playwright, poza repo; operator = symulator deweloperski wysyłający podpisane powiadomienie na prawdziwy endpoint) | panel: wybór operatora, sekret (pole puste po zapisie — sekret nie wraca), test połączenia, włączenie → sklep: „Płatność online” w checkoucie → przekierowanie → powiadomienie → „Płatność otrzymana” → panel: zamówienie opłacone z referencją operatora; 0 błędów konsoli | ✔ |

## Usprawnienia UX katalogu (2026-11-26)

- **Wygląd sklepu — galeria szablonów**: wszystkie 8 szablonów darmowych (nazwy: Atelier, Róża, Volt, Bajka, Ostoja,
  Sprint, Tor, Kruszec). Sklep bez wybranego szablonu trafia do galerii: karty z miniaturą sklepu (komputer + telefon,
  rysowaną z kolorów i układu szablonu), paleta, styl, cechy, „Polecany dla Twojej branży”, filtry stylu i branży,
  szczegóły w oknie. „Wybierz szablon” zmienia tylko szkic (teksty sprzedawcy zostają). Widok konfiguracji: karta
  „Twój szablon” z krokami (wybierz → dopasuj i zapisz → opublikuj), „Zmień szablon” wraca do galerii, ustawienia z
  objaśnieniami grup, ostrzeżenie o słabym kontraście tekstu, przycisk strony głównej wybierany z drzewa kategorii,
  podgląd „Na żywo” (natychmiast) i „W sklepie” (prawdziwy sklep ze szkicem, komputer/tablet/telefon).
  E2E: galeria → filtr → szczegóły → wybór → konfiguracja (kontrast) → zapis → podgląd w sklepie → publikacja → zmiana
  szablonu z zachowaniem tekstów; widoki mobilne bez przewijania w bok, 0 błędów konsoli.
- **Strony i dokumenty prawne**: zakładka „Strony” to lista — dokumenty prawne (postęp „x z 4 gotowe”, status,
  „Wymagany”, liczba brakujących informacji, „Utwórz ze wzoru” → od razu edytor) i pozostałe strony; kliknięcie
  wiersza otwiera edycję. Edytor dokumentu prawnego: panel „Dokument prawny ze wzoru” z listą braków, „Dane w
  dokumentach” (dane firmy, termin wysyłki z propozycjami, data obowiązywania, adres zwrotów, narzędzia statystyk i
  reklam — polityka prywatności opisuje tylko to, czego sklep używa) i „Wstaw aktualny wzór” (do przejrzenia przed
  zapisem, z ostrzeżeniem o nadpisaniu); każda strona ma zakładkę „W sklepie” — prawdziwa strona sklepu (także szkic)
  w widokach Komputer / Tablet / Telefon. Migracja V15, `LegalSettingsIT`; E2E: lista → utworzenie ze wzoru → edytor
  → dane → wzór → publikacja → podgląd na komputerze i telefonie, iPhone 13 bez przewijania w bok, 0 błędów konsoli.
- **Wczytywanie bez spinnerów**: wszędzie cieniowane szkielety (shimmer) w kształcie treści — lista, tabela, formularz,
  karty, szczegóły, cała strona panelu; karty statystyk z cieniowaniem zamiast „—”; przyciski w trakcie akcji mają
  przesuwający się połysk zamiast kółka; szkielet w `index.html` widoczny od pierwszej chwili (przed startem Angulara)
  w panelu i panelu admina; w sklepie klienta szkielety w kolorach motywu. Animacja wyłączona przy „ogranicz ruch”.
- **Logowanie i rejestracja** bez karty: spokojna strona z jedną kolumną, duży nagłówek, białe pola z obramowaniem,
  przycisk Google na górze (gdy skonfigurowany), pokazywanie hasła (ikona oka) w logowaniu, rejestracji i resecie
  hasła, bez powtarzania hasła, wskaźnik siły hasła. **Panel na całą szerokość** — bez ramki z marginesem na dużych
  ekranach i bez wąskiego, wyśrodkowanego kontenera treści. W kreatorze „Wstecz” po lewej, „Dalej” po prawej.
- **Kreator startowy** zamiast formularza w karcie: po pierwszym zalogowaniu 4 kroki na szarym tle, jedno pytanie na
  ekran, pasek postępu, „Dalej”/Enter, „Wstecz” (dane zostają): nazwa i adres sklepu (sprawdzanie dostępności) → branża
  (można pominąć) → dane firmy z walidacją NIP i kodu pocztowego (można „Uzupełnić później”) → e-mail do zamówień
  (wstępnie e-mail konta), ceny brutto/netto i podsumowanie. Sklep powstaje na końcu; jeśli zapis danych firmy się nie
  uda, sklep zostaje, a komunikat kieruje do Ustawień. Na telefonie przyciski przypięte do dołu ekranu.
  E2E: walidacje (pusta nazwa, zły NIP), automatyczny format kodu „31001” → „31-001”, powrót bez utraty danych,
  zapisane dane firmy i branża, widok mobilny bez poziomego przewijania, 0 błędów konsoli.
- **Branża sklepu** (35 typów) przy zakładaniu sklepu i w Ustawieniach (wyszukiwarka, siatka z ikonami, klawiatura).
  Na jej podstawie: gotowe zestawy wariantów, propozycja drzewa kategorii (jednym kliknięciem, istniejące pomijane,
  adresy podkategorii z nazwą rodzica), typowy rozmiar paczki, typ „cyfrowy” dla produktów cyfrowych. Migracja V14.
- **Zdjęcia produktu**: można je dodać już przy tworzeniu produktu (wysyłane po zapisie), przycisk „Dodaj zdjęcia”,
  duża strefa upuszczania, przeciągnij-i-upuść — reszta strony się rozmywa, a karta „Zdjęcia” dostaje przerywaną
  ramkę z ikoną; zmiana kolejności przeciąganiem (strzałki zostały dla klawiatury), walidacja typu i rozmiaru.
- **Kategorie**: prawdziwe drzewo (linie, zwijanie, licznik podkategorii) na stronie kategorii i w produkcie
  (wyszukiwarka, wybrane jako chipy ze ścieżką „Damskie › Sukienki”); rodzic w formularzu jako pełna ścieżka.
- **Warianty**: zestawy (rozmiary odzieży/obuwia/dziecięce, kolory z próbkami, pojemności, pamięć…) — najpierw te dla
  branży; wartości jako chipy (Enter, przecinek, wklejenie listy, Backspace), podpowiedzi brakujących wartości,
  masowa zmiana ceny i stanu (wszystkie lub np. tylko rozmiar XL).
- **Paczka**: gotowe rozmiary (koperta → gabaryt) z oznaczeniem typowego dla branży, kg i cm zamiast g i mm,
  informacja, czy paczka zmieści się w paczkomacie (A/B/C).
- **SEO**: podgląd wyniku Google na żywo, wartości automatyczne z nazwy i opisu, „Uzupełnij za mnie”, liczniki z
  zalecaną długością, wyjaśnienia „?” (także przy nazwie, cenie przed obniżką/Omnibus, SKU, EAN); pola opcjonalne
  oznaczone „(opcjonalnie)” w całym panelu.
- Testy: `StoreIndustryIT`, 13 nowych testów jednostkowych (drzewo, warianty, branże, SEO, jednostki, kolejność zdjęć);
  E2E (Playwright, poza repo): branża → propozycje kategorii → nowy produkt z 2 zdjęciami upuszczonymi przed zapisem,
  zestawy wariantów, masowa cena dla XL, paczka, SEO, kategoria z drzewa → zapis → zmiana kolejności zdjęć
  przeciąganiem; iPhone 13 bez poziomego przewijania; 0 błędów konsoli.

## Faza 5b — wysyłka InPost (2026-11-26)

- Moduł `shipping`: konto sprzedawcy w InPost ShipX (szyfrowane dane, sandbox, test, włączanie), powiązanie metody
  dostawy z przewoźnikiem, wybór paczkomatu w checkoucie (wyszukiwanie po kodzie/mieście, weryfikacja u przewoźnika),
  przesyłki z zamówienia (gabaryt A/B/C lub waga i wymiary, pobranie dla COD), etykieta PDF, śledzenie co 30 min,
  automatyczna realizacja zamówienia po doręczeniu, link „Śledź przesyłkę” w e-mailu.
- Testy: `InPostShipXCarrierTest` (5, lokalny serwer HTTP udający ShipX), `ShippingIT` (pełny przepływ + izolacja).
- E2E (Playwright, poza repo): symulator przewoźnika w panelu → powiązanie metody → klient wyszukuje i wybiera paczkomat
  (walidacja „Wybierz paczkomat.”) → potwierdzenie z punktem → panel: przesyłka, etykieta PDF, wysyłka, status „W drodze”;
  iPhone 13 bez poziomego przewijania; 0 błędów konsoli. E2E wykrył błąd: oznaczenie „Wysłane” bez numeru kasowało numer
  przewoźnika — naprawione i pokryte testem.

## Faza 5a — płatności online w sklepach (2026-11-26)

- Moduł `storepayments`: konto sprzedawcy u Przelewy24 / PayU / Tpay (szyfrowane dane, tryb sandbox, test połączenia,
  włączanie po teście), płatność przy zamówieniu i jej ponowienie (strona potwierdzenia, konto klienta), powiadomienia z
  weryfikacją podpisu kluczem sklepu, zgodnością kwoty i waluty, idempotencją; wpłata po anulowaniu oznaczona do zwrotu;
  nieopłacone zamówienia online anulowane po 24 h. Płatność online wystarcza do publikacji sklepu.
- Test integracyjny `StorePaymentsIT`: konfiguracja (sekret nie wraca w API), podrobiony podpis (400), zła kwota (bez
  zaksięgowania), powtórzone powiadomienie (jedno zaksięgowanie), wpłata po anulowaniu, izolacja sklepów.

## Domknięcie znanych ograniczeń (2026-11-26)
- **CSP witryny** z `script-src`: skrypty tylko z własnej domeny, Cloudflare Turnstile, skróty SHA-256 stałych skryptów
  z szablonu buildu (liczone przy starcie serwera) i jednorazowy `nonce` na odpowiedź dla skryptów SSR Angulara; bez
  `unsafe-inline`. Sprawdzone pełnymi scenariuszami E2E (sklep, treści, konta) — 0 naruszeń w konsoli.
- **Zdarzenia (outbox)**: ponowienia z rosnącą przerwą (5 min → maks. 6 h), najwyżej 10 prób; potem zdarzenie zostaje
  jako „martwe” i jest raportowane w logu raz dziennie; zakończone publikacje usuwane po 30 dniach (test `EventRedeliveryTest`).

## Konto klienta: ulubione, zwroty i reklamacje (2026-11-27)

- **Ulubione:** serduszko na kafelkach i karcie produktu, strona `/ulubione`, licznik w nagłówku. Gość trzyma ulubione w
  przeglądarce; po zalogowaniu trafiają na konto (dostępne na każdym urządzeniu).
- **Ostatnio oglądane:** pasek pod kartą produktu (tylko w przeglądarce klienta, bez śledzenia po stronie serwera).
- **Zwroty i reklamacje:** klient zgłasza je ze strony zamówienia (wybór produktów i liczby sztuk, rodzaj zgłoszenia,
  opis wady, rachunek do zwrotu); terminy: zwrot 14 dni od doręczenia, reklamacja 2 lata od wysyłki. Zakładka „Zwroty i
  reklamacje” w koncie pokazuje status i odpowiedź sklepu. W panelu nowa strona „Zwroty i reklamacje”: przyjęcie/odrzucenie
  z wiadomością, zakończenie; e-mail do klienta przy każdej zmianie, do sklepu przy nowym zgłoszeniu.
- Testy: `AccountsIT` (ulubione, karty produktów między sklepami, pełny przebieg zwrotu, walidacje, wersje, izolacja
  sklepów, koniec terminu na zwrot); ręczne E2E (Playwright): ulubione gościa → rejestracja → scalenie na koncie,
  ostatnio oglądane, zamówienie → wysyłka → zgłoszenie zwrotu → przyjęcie i zakończenie w panelu → status i 3 e-maile u
  klienta; telefon bez poziomego przewijania; 0 błędów konsoli.
- Naprawione w trakcie: `null` w parametrach aktualizacji (NPE), typ parametru `NULL` w PostgreSQL.

## Silnik wyglądu sklepu i edytor (2026-11-27)

- **Sekcje strony głównej** (10 typów, maks. 20): baner (3 układy, zdjęcie), zalety, kategorie ze zdjęciami, listy
  produktów (nowości / promocje / kategoria / wybrane), zdjęcie z tekstem, FAQ (z JSON-LD `FAQPage`), newsletter,
  opinie klientów, tekst, wpisy z bloga. Każdy szablon ma własny domyślny układ sekcji.
- **Nagłówek i stopka:** logo, styl (klasyczny/wyśrodkowany), przyklejony nagłówek, wyszukiwarka, pasek ogłoszeń;
  nawigacja w telefonie jako menu boczne albo dolny pasek; newsletter i media społecznościowe w stopce.
- **Edytor wyglądu** (pełny ekran, bez menu panelu): osobne widoki — lista sekcji, edycja sekcji, dodawanie sekcji,
  nagłówek, stopka, kolory, typografia; przeciąganie kolejności, ukrywanie, podgląd na żywo w 3 rozmiarach urządzeń,
  biblioteka zdjęć (przeciągnij i upuść), ostrzeżenie przed wyjściem bez zapisu, publikacja. „Wygląd sklepu” to teraz
  przegląd szablonu z wejściem do edytora i galerii.
- **Zdjęcia kategorii** w oknie edycji kategorii (przycisk lub przeciągnięcie) i miniatury w drzewie.
- **Newsletter:** double opt-in, potwierdzenie i wypis linkiem, lista w panelu (Rozwój → Newsletter) z licznikami,
  wyszukiwaniem, usuwaniem i eksportem potwierdzonych adresów do CSV.
- **Strony startowe:** „O nas”, „Kontakt”, „Najczęstsze pytania” — jednym kliknięciem jako szkic wypełniony danymi firmy.
- Testy: `ThemeSectionsIT`, `NewsletterIT`; ręczne E2E (Playwright, poza repo): edycja banera z podglądem na żywo,
  wgranie zdjęcia, dodanie FAQ, dolny pasek w telefonie, zapis; zdjęcie kategorii (dodanie/usunięcie), lista
  newslettera, utworzenie strony „Kontakt” — 0 błędów konsoli.
- Naprawione w trakcie: brak typów `THEME`/`CATEGORY` w ograniczeniu `media_assets` (409) → V16; wiązanie klasy banera
  nadpisywało odstępy; pasek edytora nie mieścił się na telefonie.

## Przegląd Faz 4b–4e (2026-11-26) — naprawione
Blokada kont klientów zastąpiona limitem per adres (bez możliwości blokowania cudzych kont i bez ujawniania, czy konto
istnieje), tokeny w linkach e-mail przeniesione do fragmentu adresu (nie trafiają do logów), skróty e-maili w kluczach
Redisa, opinie bez bezpośredniego SQL do tabel zamówień, usuwanie niepotwierdzonych rejestracji po 30 dniach, poprawne
linki z parametrami w menu i treści. Szczegóły: `docs/SECURITY.md` §13.

## Faza 4e — CAPTCHA i menu sklepu (2026-11-26)

- CAPTCHA Cloudflare Turnstile w checkoucie, rejestracji i resecie hasła (weryfikacja po stronie serwera; jednorazowe
  tokeny resetowane po każdej próbie). W produkcji obowiązkowa (aplikacja nie wystartuje bez kluczy).
- Menu nagłówka edytowane w panelu („Strony i blog” → Menu): kategorie, strony, blog, wszystkie produkty lub własny adres
  w sklepie; do 12 pozycji; tylko adresy w sklepie.
- Panel: oznaczenie klientów z potwierdzonym kontem (lista i karta klienta).
- Błędy znalezione w E2E i naprawione: serwer SSR nie przekazywał nagłówka `X-Captcha-Token` (test integracyjny trafiał
  bezpośrednio w API); widget był resetowany dopiero po odświeżeniu koszyka, co mogło skasować ponowne potwierdzenie.

## Integracje płatności i kurierów (2026-11-27)

- Stripe Connect (kreator Stripe zamiast kluczy, direct charges, webhook platformy), Furgonetka (logowanie OAuth) i Apaczka
  (podpis HMAC) jako agregatory — sprzedawca zaznacza kurierów i ceny, powstają gotowe sposoby dostawy. Szczegóły:
  `docs/INTEGRATIONS.md`; loga: `docs/BRAND_ASSETS.md`. Migracje V21–V22.
- Testy: `StripeConnectIT`, `CourierAggregatorsIT` (lokalne zamienniki API); E2E w panelu na lokalnym zamienniku:
  Stripe (połącz → weryfikacja → włącz), Apaczka (klucze → kurierzy → 2 sposoby dostawy), Furgonetka (logowanie → powrót).
- **Nie sprawdzone na prawdziwych API** (brak kluczy sandbox) — wymagane przed produkcją.

## Klienci w panelu (2026-11-27)

- Lista jak w Shopify: zaznaczanie, kolumny subskrypcja e-maili / lokalizacja / zamówienia / wydana kwota, tagi, filtr tagu,
  akcje „Dodaj tag” i „Eksportuj zaznaczonych”; przyciski Eksportuj (wszyscy / zaznaczeni / tylko subskrybenci), Importuj (CSV
  z przykładowym plikiem i raportem błędów), Dodaj klienta.
- Strona klienta (`klienci/nowy`, `klienci/:id`) zamiast okienka: dane, zgoda z datą i źródłem, adres domyślny, zamówienia,
  notatki, tagi, pasek „Niezapisane zmiany”.
- Backend: V19, `POST/PUT /customers`, tagi, import/eksport CSV (testy `CustomersIT`).
- Pominięte celowo: język powiadomień (e-maile są tylko po polsku), zgody SMS/WhatsApp (brak takich kanałów), segment opisywany
  przez AI, usuwanie klientów (wymaga procesu RODO powiązanego z zamówieniami).

## Faza 4d — konta klientów (2026-11-26)

- Moduł `accounts`: rejestracja z potwierdzeniem e-maila (link + hasło z rejestracji), logowanie z blokadą po 5 próbach,
  reset i zmiana hasła (wylogowanie innych sesji), usunięcie konta, adresy, historia zamówień po potwierdzonym e-mailu.
- Sklep: logowanie, rejestracja, aktywacja, reset hasła, „Moje konto” (zamówienia, do oceny, adresy, ustawienia),
  szczegóły zamówienia, ikona konta w nagłówku, dane z konta w checkoucie.
- Opinie: weryfikacja zakupu zaostrzona — tylko zamówienia zrealizowane **i opłacone** (lub za pobraniem), nigdy zwrócone;
  zalogowany klient ocenia tylko produkty z własnych takich zamówień.
- Błąd projektowy wykryty przed wdrożeniem i naprawiony: ponowna rejestracja niepotwierdzonego adresu mogła pozwolić
  przejąć konto po kliknięciu linku przez właściciela skrzynki — aktywacja wymaga teraz hasła z tej rejestracji (test).

## Faza 4c — opinie o produktach (2026-11-26)

- Moduł `reviews`: opinię może wystawić tylko kupujący — po realizacji zamówienia ze sklepu wysyłamy jednorazowy link
  (ważny 90 dni) z listą produktów z tego zamówienia; jedna opinia na produkt w zamówieniu.
- Moderacja w panelu („Opinie”: do moderacji / opublikowane / odrzucone), publiczna odpowiedź sklepu, e-mail o nowej opinii,
  przypomnienie w panelu, że nie wolno ukrywać opinii tylko dlatego, że są negatywne.
- Karta produktu: średnia, liczba, rozkład ocen, oznaczenie „Zweryfikowany zakup”, informacja o sposobie weryfikacji
  (wymóg dyrektywy Omnibus), dane strukturalne `AggregateRating` i `Review`.

## Faza 4b — strony, blog, dokumenty prawne, przekierowania (2026-11-26)

- **Strony i blog** (moduł `content`): strony informacyjne i wpisy, szkic/publikacja, podgląd w sklepie, SEO, link w
  stopce; treść w bezpiecznym podzbiorze Markdown (podgląd w panelu = renderowanie w sklepie).
- **Dokumenty prawne**: wzory regulaminu, polityki prywatności, zwrotów (z wzorem formularza odstąpienia) i dostawy
  wypełniane danymi firmy; wymagane do publikacji sklepu (bez znaczników „[uzupełnij…]”); niezmienne wersje; zamówienie
  zapisuje wersję zaakceptowanego regulaminu, widoczną w szczegółach zamówienia; linki w stopce i przy checkboxie.
- **Przekierowania 301**: ręczne w panelu i automatyczne po zmianie adresu produktu, kategorii, strony, wpisu;
  obsługa w serwerze SSR po 404.
- **Zdjęcia**: orientacja EXIF (zdjęcia z telefonu zapisywane prosto).

## Przegląd Fazy 4a (2026-11-26) — naprawione
Wyścigi przy uploadzie zdjęć (limit zdjęć, limit miejsca, osierocone pliki przy równoległym usunięciu produktu),
przetwarzanie zdjęć poza transakcją bazy i z limitem równoległości (ochrona pamięci), limity czasu klienta S3, limit
pobrań zdjęć, atomowy zapis szkicu motywu, ukrycie danych sprzedawcy przed publikacją, twardy wymóg klucza tokenów
podglądu, ochrona linku podglądu (usuwanie z adresu, `no-store`, `noindex`), ucieczka znaków w wyszukiwarce.
Szczegóły i testy: `docs/SECURITY.md` §12.

## Faza 3 — silnik e-commerce (2026-11-26)

- **Katalog** (`catalog`): produkty z opcjami i wariantami (generowane kombinacje), SKU/EAN z walidacją, ceny przed
  obniżką z informacją Omnibus, drzewo kategorii, marki, akcje masowe, duplikowanie, eksport CSV, limit produktów z planu.
- **Magazyn**: stany i rezerwacje, korekty z powodem i autorem, dziennik ruchów, niskie stany.
- **Sprzedaż** (`orders`, `customers`): koszyk i checkout storefrontu (API; interfejs sklepu w Fazie 4), przelew
  tradycyjny i pobranie, sposoby dostawy z progiem darmowej, numeracja zamówień, VAT, realizacja (opłacone → wysłane z
  numerem przesyłki → zrealizowane), anulowanie ze zwolnieniem towaru, auto-anulowanie nieopłaconych przelewów,
  e-maile do klienta i sklepu, zamówienia ręczne z panelu, klienci ze zgodami i eksportem.
- **Panel**: Produkty, edytor produktu, Kategorie i marki, Magazyn, Zamówienia, Szczegóły zamówienia, Nowe zamówienie,
  Klienci, Wysyłka, Płatności; Przegląd pokazuje prawdziwą sprzedaż, zamówienia i niskie stany.
- Błędy znalezione testami i naprawione: edycja samych wariantów nie podbijała wersji produktu (brak wykrycia równoległej
  edycji), błędna formuła Omnibus (uwzględniała cenę bieżącą), warianty nie generowały się po wpisaniu opcji w edytorze.

## Faza 2 — subskrypcje SaaS (2026-11-25)

Decyzje właściciela: **bez Stripe**; obsługa polskich operatorów (ADR-013). Pytanie „czy sklep na najtańszym planie z
dużym ruchem może kosztować więcej, niż płaci?” rozwiązane limitami jako danymi, fair use i raportem rentowności (ADR-014).

- **`payments`** — adaptery Przelewy24 (REST v1, SHA-384, obowiązkowa weryfikacja transakcji), PayU (REST 2.1, OAuth,
  `OpenPayu-Signature`), Tpay (Open API, `md5sum`) oraz symulator tylko dev/test (blokada startu w prod/staging).
  Ten sam zestaw adapterów posłuży sprzedawcom w Fazie 5.
- **`billing`** — administrator wybiera i konfiguruje operatora w panelu (dane szyfrowane, sekrety nie wracają do
  przeglądarki, test połączenia), linki płatności, odbiór powiadomień z deduplikacją i ponawianiem.
- **`subscriptions`** — plany/ceny/limity edytowalne (ceny „grandfathered”), 14 dni próby po utworzeniu sklepu,
  checkout (zachowuje dni próby), zmiana planu (wyżej od razu z proracją, niżej od końca okresu), rezygnacja/wznowienie,
  odnowienia (opłata 7 dni przed końcem + przypomnienia), 7 dni karencji, potem tryb **tylko do odczytu** (zapisy → 402,
  witryna sklepu niedostępna; płatność zawsze możliwa), kupony, VAT 23% (ceny netto), e-maile, historia.
- **Limity** — twarde (np. zespół → 402 `ENTITLEMENT_LIMIT`), fair use (zamówienia, odsłony) nigdy nie blokuje sklepu;
  wyjątki per sklep w panelu admina; zużycie liczone w Redisie i zapisywane do `tenant_usage`.
- **Panel sprzedawcy** — strona „Subskrypcja” (plany, płatności, historia, zużycie, limity) i baner stanu w każdym widoku.
- **Panel admina** — Subskrypcje (MRR/ARR, szczegóły, przedłużanie próby, wyjątki), Plany i limity, Kupony,
  Zużycie i rentowność, Operatorzy płatności; MRR/ARR na przeglądzie.
- Błędy znalezione testami i naprawione: zablokowane odnowienie przy zmianie końca okresu (stara otwarta opłata),
  kolejność INSERT/UPDATE w Hibernate przy wymianie opłaty (unikalny indeks), brak klienta HTTP dla adapterów w Boot 4,
  nieprawdziwa informacja o fakturach w UI.

## Faza 1 — co zrobiono

**Backend** (`backend/`, Spring Boot 4.1.3, Java 21, modularny monolit weryfikowany Spring Modulith):
- Moduły: `shared`, `users`, `authentication`, `tenants`, `stores`, `domains`, `audit`, `email`, `admin`.
- Flyway `V1__core_platform.sql`: 14 tabel, RLS na danych dzierżaw, rola aplikacji bez `BYPASSRLS`, dziennik audytu append-only.
- Izolacja dzierżaw: `TenantContext` + `TenantAwareDataSource` (zmienne sesji RLS) + Hibernate `@TenantId`; blokada przełączania kontekstu wewnątrz transakcji.
- Uwierzytelnianie: rejestracja (bez enumeracji kont), weryfikacja e-mail, logowanie, wylogowanie, reset/zmiana hasła, sesje w ciasteczku `__Host-` HttpOnly z rotacją, lista/unieważnianie sesji, CSRF (SPA), Argon2id, polityka haseł, blokada konta + limity Redis, TOTP + kody zapasowe, Google OAuth2 (profil `google`, wymaga poświadczeń — nieprzetestowane z prawdziwym Google).
- Sklepy: tworzenie sklepu jako 1 transakcja (dzierżawa + OWNER + sklep + ustawienia + subdomena), ustawienia ogólne, dane firmy (walidacja NIP i kodu pocztowego), blokada optymistyczna.
- Zespół: macierz ról/uprawnień, zaproszenia (tokeny wysyłane tylko e-mailem, w bazie hash), reguły ostatniego właściciela.
- Routing storefrontu: `GET /api/v1/storefront/store` rozpoznaje sklep po hoście.
- Panel admina (API): przegląd, sklepy, użytkownicy, zawieszanie/przywracanie, dziennik.
- E-maile transakcyjne (Thymeleaf, PL) przez outbox Spring Modulith z ponawianiem.
- Actuator (health/readiness/liveness/prometheus na osobnym porcie), Problem Details (RFC 9457), OpenAPI (dev).

**Frontend** (`frontend/`, Angular 22.3, standalone, zoneless, signals, Tailwind 4):
- `libs/shared-ui` (system projektowy), `libs/api-client` (HTTP, CSRF, błędy, sesja, guardy), `libs/shared-models`.
- `merchant-dashboard`: logowanie, MFA, rejestracja, weryfikacja, reset hasła, zaproszenia, onboarding sklepu (sprawdzanie dostępności adresu), lista sklepów, przegląd z realną listą „Pierwsze kroki”, ustawienia, zespół, dziennik, konto (profil, hasło, MFA z QR, sesje).
- `platform-admin`: logowanie + MFA, przegląd, sklepy, użytkownicy, dziennik.
- `storefront` (SSR): rozpoznanie sklepu po hoście, stany „w przygotowaniu” / 404 / 503 z poprawnymi kodami HTTP.

**Infrastruktura**: `docker-compose.yml` (Postgres, Redis, Mailpit, MinIO), `docker/backend.Dockerfile`, CI GitHub Actions, Dependabot.

## Błędy znalezione i naprawione podczas weryfikacji
- Sondy Actuatora blokowane przez Spring Security → poprawione + test `ActuatorIT`.
- Wyszukiwanie sklepów w panelu admina bez filtra → `500` (nietypowany `NULL` w JPQL) → poprawione + test regresyjny.
- Kolejność tras w panelu (`/` nie przekierowywał do logowania) → poprawione.

## Redesign interfejsu (2026-11-25)

Nowy system projektowy wg referencji „E-COM dashboard” (`docs/DESIGN_SYSTEM.md`), wspólna powłoka `sv-app-shell`
dla panelu sprzedawcy i admina, ikony Lucide, własne wykresy SVG. Panel sprzedawcy: pełna nawigacja z briefu
(moduły bez backendu oznaczone „Wkrótce”), przegląd z kartami KPI/wykresami w jawnym stanie „brak danych”.
Panel admina: realne dane (nowy endpoint `GET /api/v1/admin/stats/growth`, parametr okresu w `/overview`).
Zweryfikowano: build produkcyjny, CSP (0 naruszeń), 0 px poziomego przepełnienia na 390/900/1440 px, pełny przepływ
E2E w przeglądarce.

## Przegląd Faz 2–3 (2026-11-26) — naprawione
12 ustaleń (szczegóły: `SECURITY.md` §11), m.in.: limit rozmiaru żądań (DoS publicznego API), limit żądań API panelu na
użytkownika, błąd przyjęcia dostawy przy przedsprzedaży, realizacja zamówień przy wygasłej subskrypcji, blokada zmiany
waluty przy istniejących cenach, polskie komunikaty błędów, walidacja przekierowania do operatora, sprzątanie koszyków
i indeksy zadań (migracja V6). Nowe testy: `ReviewRegressionIT` (5), `BackorderIT` (1), test przekierowań (frontend).

## Przegląd bezpieczeństwa i gotowości produkcyjnej (2026-11-25) — naprawione

| # | Problem | Poprawka | Test |
|---|---|---|---|
| 1 | RLS `tenant_memberships` pozwalała usunąć własne członkostwo w obcym sklepie (wspólne `USING` dla DELETE) | `V2__security_hardening.sql` — osobne polityki SELECT/INSERT/UPDATE/DELETE | `RowLevelSecurityIT.ownMembershipInForeignTenant…` |
| 2 | CSRF: witryny `*.platforma` to ten sam „site”; możliwe podrzucenie ciasteczka i token z parametru `_csrf` | `__Host-XSRF-TOKEN` HttpOnly, token tylko z nagłówka, kod `CSRF_INVALID`, ADR-012 | `AuthenticationFlowIT.csrfCookieCannotBeTossed…` |
| 3 | Token CSRF czyszczony przy każdym uwierzytelnionym żądaniu (`SessionManagementFilter` + `CsrfAuthenticationStrategy`) — wcześniej maskowany przez klienta | zarządzanie sesją Spring Security wyłączone, jawna rotacja przy logowaniu/MFA/wylogowaniu | `csrfTokenStaysValidAcrossAuthenticatedRequests` + E2E w przeglądarce |
| 4 | Nieograniczony cache hostów (klucz kontrolowany przez atakującego) | walidacja hosta + Caffeine (20k, 30 s) | `StoreDomainsTest.normalizesAndRejectsHostHeaders` |
| 5 | Limit storefrontu omijalny zmianą `Host`; SSR nie przekazywał IP klienta (wspólny limit dla całego ruchu SSR) | klucz per IP; SSR przekazuje `X-Forwarded-For` przez `REQUEST_CONTEXT` | `api-origin.spec.ts` |
| 6 | Zgadywanie MFA przez otwieranie nowych sesji | dodatkowy limit per konto (10/15 min) i na wyłączanie MFA | `MfaIT.mfaVerificationIsRateLimited` |
| 7 | Administratorzy platformy bez wymaganego MFA | uprawnienia platformowe tylko przy włączonym MFA (konfigurowalne) | `PlatformStaffMfaIT` |
| 8 | Bootstrap admina podnosił uprawnienia istniejącemu, niezweryfikowanemu kontu | odmowa + log błędu | `PlatformAdminBootstrapTest` |
| 9 | `/actuator/prometheus` dostępny niezależnie od portu | reguła oparta na porcie zarządzania | `ActuatorIT` |
| 10 | Redis w readiness (awaria = wszystkie pody poza ruchem); aplikacja z hasłem właściciela schematu | readiness = `db`; `SHOPIVO_FLYWAY_ENABLED` + job migracji | konfiguracja + dokumentacja |
| 11 | Wyścig reguły „≥1 właściciel”; uprawnienia aktora odczytane przed zmianą | blokada pesymistyczna wiersza dzierżawy, ponowny odczyt aktora | istniejące testy zespołu |
| 12 | Naruszenia ograniczeń unikalności → 500 | globalnie 409 `CONFLICT` bez szczegółów | — |
| 13 | Outbox zdarzeń rósł bez końca | `completion-mode: delete` | — |
| 14 | Frontend: brak obsługi wygaśnięcia sesji; zła kolejność interceptorów | przekierowanie na logowanie z powrotem; łańcuch testowany w całości | `csrf.spec.ts` |
| 15 | Brak obrazów i nagłówków bezpieczeństwa dla SPA; inline'owany skrypt krytycznego CSS łamałby CSP | `docker/spa.Dockerfile` + nginx (CSP, HSTS, COOP), `inlineCritical: false` | build pod CSP w Chromium: 0 naruszeń |
| 16 | Brak kontekstu w logach | MDC `userId`, `tenantId` | — |
| 17 | IDOR: obiekty innego sklepu adresowane przez ścieżkę własnego sklepu | (było bezpieczne — potwierdzone testem) | `TenantIsolationIT.foreignResourceIds…` |

## Znane ograniczenia / dług do spłacenia
- Sesja jest odczytywana z bazy przy każdym żądaniu (2 zapytania po kluczu głównym) — cache Redis zaplanowany na Fazę 8.
- Walidacja Bean Validation wykonuje się przed `@PreAuthorize` (członkostwo jest już zweryfikowane filtrem, więc nie ujawnia danych innych sklepów).
- **Faza 2:** adaptery operatorów napisane wg publicznej dokumentacji i przetestowane na atrapie HTTP — **nie były
  uruchomione na sandboxach Przelewy24/PayU/Tpay** (brak kont testowych w tym środowisku). Wymagane przed produkcją.
- **Faza 2:** brak faktur VAT / KSeF (Q-06) — opłaty mają netto/VAT/brutto, ale dokumentu księgowego nie wystawiamy.
- **Faza 2:** brak płatności cyklicznych (karta/BLIK zapisany u operatora) — sprzedawca płaci za każdy okres z przypomnień.
- **Faza 2:** pamięć podręczna stanu subskrypcji jest per instancja (30 s) — po zmianie na innej replice dostęp
  aktualizuje się w ciągu 30 s. Model kosztów w raporcie rentowności to wartości szacunkowe do kalibracji.
- **Faza 2:** limity produktów, plików i AI są zdefiniowane, ale egzekwowane będą wraz z tymi modułami (Fazy 3–7);
  licznik zamówień ruszy z modułem zamówień.
- **Faza 3:** brak importu CSV, rabatów, zwrotów/reklamacji i kont klientów (zaplanowane w kolejnych fazach).
- **Faza 4b:** wzory dokumentów prawnych to punkt wyjścia, nie porada prawna — przed udostępnieniem sprzedawcom
  produkcyjnym powinien je przejrzeć prawnik (Q-08). Panel wyraźnie to komunikuje.
- **Faza 4b–4e:** brak zdjęć we wpisach bloga.
- **Faza 5a:** adaptery Przelewy24 / PayU / Tpay sprawdzone tylko na atrapach HTTP i symulatorze — **przed produkcją
  konieczny test na sandboxach operatorów** (wymaga kont testowych). Zwroty wykonuje sprzedawca w panelu operatora (zwrot
  przez API — Faza 5b). Brak raportu płatności w panelu (widoczne w historii zamówienia).
- **Szablony:** 8 szablonów na jednym silniku (ADR-016, ADR-023); miniatury w galerii są rysowane, nie są zrzutami
  prawdziwego sklepu.
- **Zwroty:** pieniądze sprzedawca zwraca sam (przelew / panel operatora) — platforma tylko prowadzi zgłoszenie; zgłoszenie
  wymaga konta klienta (gość może założyć konto na e-mail z zamówienia); brak etykiety zwrotnej przewoźnika.
- **Baner cookies:** nie dodany celowo — witryna nie ładuje skryptów analitycznych ani reklamowych, a ulubione / ostatnio
  oglądane / koszyk to funkcje, o które klient sam prosi. Baner zgody wejdzie razem z integracją analityki (Faza 7).
- Budżet ostrzeżenia rozmiaru witryny podniesiony z 500 do 520 kB (surowy rozmiar startowy po dodaniu ulubionych).
- **Edytor wyglądu:** sekcje tylko na stronie głównej (strony kategorii/produktu mają stały układ); brak cofania zmian
  (undo) poza „odrzuć niezapisane”; newsletter zbiera adresy, ale wysyłka kampanii jest poza zakresem (eksport CSV
  do zewnętrznego narzędzia); zdjęcia motywu nie mają pola tekstu alternatywnego (dekoracyjne, `alt=""`).
- **Dokumenty prawne:** odświeżenie ze wzoru zastępuje całą treść (bez scalania ręcznych zmian — panel ostrzega);
  podgląd w ramce wymaga ustawienia `SHOPIVO_PANEL_ORIGIN` w witrynie.
- **UX katalogu:** kategorie są sortowane alfabetycznie — brak zmiany kolejności (np. przeciąganiem w drzewie);
  zdjęcia nadal tylko JPEG/PNG (WebP/AVIF — później); podpowiedzi branżowe są stałą listą w panelu.
- **Faza 5b:** adapter InPost ShipX sprawdzony tylko na lokalnej atrapie API — **przed produkcją test na sandboxie
  ShipX** (wymaga konta). Brak DPD/DHL, anulowania przesyłki z panelu i zamawiania kuriera po odbiór zbiorczo (Faza 5c).
- **Faza 4e:** CAPTCHA przetestowana z lokalną atrapą Cloudflare (brak dostępu do Cloudflare z tego środowiska) — przed
  produkcją sprawdzić z prawdziwymi kluczami; przy niedostępności Cloudflare formularze działają bez CAPTCHA (świadomy
  wybór dostępności, z logiem); domeny własne sklepów trzeba dopisać w ustawieniach widgetu Turnstile.
- **Faza 4d:** zamówienie nie jest przypisywane do konta inaczej niż przez e-mail (zmiana e-maila konta nie jest jeszcze
  możliwa); brak logowania przez Google/Apple dla klientów.
- **Faza 4c:** zaproszenia do opinii tylko dla zamówień ze sklepu (nie z panelu) i tylko automatycznie po realizacji;
  brak gwiazdek na kafelkach produktów w listach; zatwierdzona opinia pojawia się w sklepie do 30 s później (cache API).
- **Faza 4b:** przekierowanie działa przy wejściu z zewnątrz (SSR); nawigacja wewnątrz aplikacji na stary adres pokaże 404.
- **Faza 4a:** zdjęcia: brak WebP/AVIF,
  przetwarzanie synchroniczne; pliki serwowane przez backend (CDN — Faza 6). Adapter S3 sprawdzony na emulatorze (moto),
  nie na prawdziwym R2/S3.
- **Faza 4a:** JSON-LD `Organization` jest tylko na stronie głównej.
- **Faza 3:** VAT od dostawy i opłaty za pobranie liczony stawką 23% (uproszczenie, patrz ADR-015).
- Lokalnie operatora trzeba raz skonfigurować w panelu admina (Rozliczenia → Operatorzy płatności → Symulator, dowolny sekret).
- Panel sprzedawcy nie ma jeszcze modułów produktów, zamówień itd. — nawigacja pokazuje wyłącznie działające sekcje.
- Dane dev: konto `admin@shopivo.local` / `Platforma!Lokalna-2026` tworzone **tylko** przy profilu `dev` lub zmiennych `SHOPIVO_BOOTSTRAP_*`.
- Regulamin/polityka prywatności — tylko checkbox akceptacji z wersją; treści wymagają prawnika (Q-08).
- Login CSRF: brak tokenu przed logowaniem jest akceptowalny (endpoint wymaga tokenu, który SPA pobiera); pełna
  separacja domen witryn (ADR-012) czeka na decyzję Q-03.
- `X-Forwarded-Host` od klienta musi być nadpisywany przez LB/Cloudflare (inaczej możliwe podanie dowolnego hosta
  sklepu — ujawnia tylko publiczne dane witryn, ale należy to skonfigurować).
- Obrazy Docker Hub bywały limitowane (429) w środowisku deweloperskim — w CI nie jest to problem.

## Następny krok
**Faza 5c**: DPD, zwroty płatności przez API operatorów; dalsze usprawnienia UX (lista produktów, zamówienia,
kreator pierwszego produktu). Przed produkcją nadal: Q-06 (faktury/KSeF),
test adapterów na sandboxach operatorów, cennik (Q-05), przegląd prawny wzorów (Q-08).

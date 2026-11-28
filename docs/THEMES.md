# Szablony sklepu — jak są zbudowane i gdzie leżą ich grafiki

Ten dokument opisuje, jak dodajemy kolejne szablony (pierwszy z własnym kodem i grafikami: **Véra**). Każdy szablon ma
swój wygląd, własne komponenty i własne zdjęcia. Sprzedawca widzi je od razu w edytorze i może każde podmienić.

## Trzy warstwy szablonu

| Warstwa | Gdzie | Co zawiera |
|---|---|---|
| **Manifest** | `backend/.../themes/ThemeRegistry.java` (preset) | kod, nazwa, domyślne ustawienia (kolory, krój, nagłówek…), domyślne sekcje strony głównej z tekstami i odnośnikami do grafik szablonu |
| **Grafiki** | `backend/src/main/resources/themes/<kod>/<nazwa>-w400.jpg` i `-w1200.jpg`, rejestr w `ThemeAssets.java` | zdjęcia dostarczane z szablonem (baner, kafelki, baner „pracownia”…); źródła i licencje w [THEME_ASSETS.md](THEME_ASSETS.md) |
| **Kod** | `frontend/apps/storefront/src/app/themes/<kod>/` + wspólne sekcje w `ui/sections.ts` | komponenty, które szablon ma inne niż standardowy układ (u Véry: nagłówek, stopka, boczny koszyk); karta produktu i strona produktu mają wariant zależny od `StoreState.layout()` |

W ofercie są tylko dwa szablony: **Véra** (domyślny) i **Bawiloo**. Wcześniejsze presety (Atelier, Róża, Volt, Bajka, Ostoja, Sprint, Tor, Kruszec) wycofano 2026-11-27. Sklepy, które je miały, zachowują swoje teksty, sekcje i ustawienia: `ThemeRegistry.RETIRED` przenosi zabawkowy szablon na Bawiloo, a resztę na Vérę.

## Grafiki szablonu: odnośnik zamiast kopii

- W szkicu i opublikowanej konfiguracji zdjęcie jest **identyfikatorem**:
  - `tpl:vera/hero` oznacza grafikę szablonu, wspólną dla wszystkich sklepów;
  - UUID oznacza zdjęcie z biblioteki danego sklepu (`theme/images`).
- Przy wyborze szablonu **nic nie jest kopiowane**: tysiąc sklepów na Vérze to wciąż 5 plików. Nie zużywa to limitu
  miejsca sprzedawcy ani nie dubluje danych.
- **Podmiana:** w edytorze okno „Wybierz zdjęcie” pokazuje najpierw „Zdjęcia szablonu”, a pod nimi „Twoje zdjęcia”.
  - Wgranie własnego zdjęcia zamienia `tpl:…` na UUID z biblioteki sklepu.
  - Kliknięcie zdjęcia szablonu przywraca oryginał.
- **Serwowanie:**
  - `GET /api/v1/theme-assets/{szablon}/{plik}.jpg` jest publiczne i ma `Cache-Control: max-age=30 dni`.
  - Serwujemy tylko pliki z rejestru `ThemeAssets`; ścieżka nigdy nie jest budowana z danych wejściowych.
  - Witryna (SSR) i panel przekazują te adresy dalej tak samo jak `/api/v1/media/**`.
- **Walidacja:** pole typu IMAGE (sekcje, także w elementach list, oraz ustawienia, np. logo) przyjmuje tylko:
  - pustą wartość,
  - UUID,
  - znany odnośnik `tpl:` z rejestru.

  Nieznany odnośnik, ścieżka typu `../` albo zewnętrzny URL są odrzucane (`INVALID_THEME`).
- **Podgląd na żywo:** panel przesyła do witryny mapę `id → adresy`. Witryna przyjmuje adresy tylko z
  `/api/v1/media/` (UUID) albo `/api/v1/theme-assets/` (`tpl:`).

### Dlaczego nie HTML/JS wgrywany jako szablon

Szablon nie jest wgrywanym plikiem HTML/JS, tylko kodem w repozytorium (komponenty Angular). Powody:

- **Bezpieczeństwo:** obcy skrypt działałby na stronie z koszykiem i logowaniem klientów każdego sklepu (XSS, kradzież sesji).
- **SSR i SEO:** komponenty renderują się na serwerze.
- **Prawdziwe dane:** szablon korzysta z tych samych usług (produkty, koszyk, konto, checkout), więc nie ma „udawanego” logowania ani zamówień.
- **Testy:** każdy szablon przechodzi przez build, testy i przegląd kodu.

Dodanie szablonu z gotowego HTML-a oznacza przeniesienie jego wyglądu na komponenty i sekcje. Atrapy z HTML-a (dane
produktów w JS, logowanie Google bez Google, przykładowe zamówienia, „checkout” czyszczący koszyk) zastępują prawdziwe funkcje sklepu.

## Skalowanie przy wielu szablonach

- **Grafiki:**
  - kilka plików na szablon, wspólnych dla wszystkich sklepów, z długim cache;
  - w produkcji przed API stoi CDN, który trzyma je na brzegu;
  - gdy będzie ich bardzo dużo, można je przenieść do tego samego magazynu S3/R2 co zdjęcia sklepów — zmienia się tylko `ThemeAssets.resource`.
- **Kod:**
  - Uwaga: komponenty szablonu są dziś w paczce startowej witryny (Véra dodała ok. 40 kB, limit ostrzeżenia podniesiony do 600 kB).
  - Przy kolejnych szablonach z własnym kodem warto ładować ich komponenty leniwie (osobny chunk na szablon).
- **Fonty:**
  - samohostowane w `apps/storefront/public/fonts/` (SIL OFL), deklarowane przez `@font-face`;
  - przeglądarka pobiera plik tylko wtedy, gdy strona używa danego kroju;
  - żadnych zapytań do Google Fonts (RODO).

## Strona szablonu, podgląd demo i licznik

- **Strona szablonu w panelu** (`/sklep/:id/wyglad/szablony/:kod`) — szczegóły zamiast okienka:
  - opis, dla jakich branż, styl, kolory;
  - co zawiera i jakie sekcje ma strona główna;
  - zdjęcia szablonu;
  - przycisk „Wybierz szablon”.
- **Licznik** „Korzysta z niego N sklepów” (`ThemeUsage`):
  - to wyłącznie liczba, bez danych sklepów;
  - liczy szablon opublikowany albo szkic, bez zawieszonych sklepów; wycofane kody liczą się do następcy;
  - wynik jest w pamięci podręcznej 10 minut i odświeża się po zapisie lub publikacji szablonu.
- **Podgląd demo** — prawdziwa witryna w trybie `?szablon=KOD`, w ramce (komputer lub telefon) albo w nowej karcie:
  - dane pochodzą z `GET /api/v1/storefront/demo/{KOD}/…`: ten sam kształt API co sklep, ale tylko przykładowy katalog szablonu, bez żadnego sklepu i bez danych klientów;
  - koszyk, zamówienia, konta i newsletter są wyłączone (409 `TEMPLATE_DEMO` i baner w witrynie);
  - strony demo mają `noindex`;
  - jeden **katalog demo** może obsługiwać kilka szablonów (`ThemeSamples.CATALOG_OF`), np. wszystkie szablony modowe korzystają z tych samych ubrań;
  - link podglądu sklepu (`?podglad=`) zawsze wyłącza tryb demo w tej samej karcie.
- **Edytor i sklep** pokazują wyłącznie produkty sprzedawcy. Przykładowe produkty można świadomie dodać do sklepu przyciskiem w edytorze.

## Zmiana szablonu i zgodność wersji

- **Zmiana szablonu w galerii:** przenosi tylko treści, które sprzedawca sam zmienił, czyli inne niż domyślne w poprzednim szablonie: teksty banera, własne zdjęcie, logo, pasek informacyjny, stopkę i media społecznościowe. Teksty przykładowe i zdjęcia `tpl:` starego szablonu zastępuje treść nowego.
- **Zgodność witryny z panelem:** witryna w podglądzie zgłasza listę szablonów, które umie narysować (`SUPPORTED_TEMPLATES` w `store-state.ts`, razem z „shopivo:ready”). Jeśli wybranego szablonu na niej nie ma (starsza wersja witryny), edytor pokazuje ostrzeżenie zamiast mylącego podglądu.

## Dodanie nowego szablonu — lista kroków

1. Grafiki: pliki `<nazwa>-w400.jpg` i `-w1200.jpg` w `resources/themes/<kod>/`. Wpis w `ThemeAssets.ALL`. Źródło i licencja w `THEME_ASSETS.md`.
2. Preset w `ThemeRegistry.PRESETS`: ustawienia i sekcje z odnośnikami `tpl:<kod>/<nazwa>`.
3. Jeśli szablon potrzebuje własnych komponentów:
   - utwórz katalog `storefront/src/app/themes/<kod>/`;
   - dodaj wartość w `StoreState.layout()`;
   - dodaj przełączenie w `app.ts`.
4. Panel: opis w `theme-meta.ts` (branże, styl, cechy). Miniatura w galerii rysuje się sama z ustawień i grafik szablonu.
5. Testy:
   - `ThemeSectionsIT`: preset jest zapisywalny, grafiki są serwowane, nieznane odnośniki są odrzucane;
   - E2E: zrzuty na komputerze i telefonie.

## Przykładowe produkty szablonu

- **Definicja:** szablon ma listę przykładowych produktów w `ThemeSamples.SAMPLES` (u Véry jest ich 8). Każdy produkt ma nazwę, kategorię, cenę, ewentualną cenę przed obniżką, rozmiary i zdjęcie `tpl:`.
- **Tylko w podglądzie:**
  - `GET /storefront/store` zwraca `sampleProducts` wyłącznie w podglądzie (`?podglad=`), a klientom zwraca pusty obiekt;
  - witryna pokazuje przykłady w sekcji produktów i na karcie „Polecamy” tylko wtedy, gdy sklep nie ma żadnego aktywnego produktu;
  - przykłady są oznaczone „Przykład” i nie są linkami, a nad nimi stoi notka, że klienci ich nie widzą.
- **Dodanie do sklepu:** dzieje się wyłącznie na prośbę sprzedawcy, przyciskiem „Dodaj przykładowe produkty” w edytorze, przez `POST /tenants/{t}/theme/sample-products` (uprawnienie `PRODUCTS_WRITE`):
  - tworzy zwykłe, aktywne produkty z wariantami rozmiarów i stanem 10 szt.;
  - tworzy brakujące kategorie;
  - kopiuje zdjęcia do mediów sklepu, więc sprzedawca może je zmienić lub usunąć;
  - pomija produkty, których nazwa już istnieje, więc można to bezpiecznie powtórzyć;
  - obowiązują limity planu.
- **Miniatura w galerii:** szablony w stylu „magazyn” rysują karty produktów ze zdjęć przykładów.

## Véra — co ma

- **Nagłówek i wygląd ogólny:**
  - ciemny pasek informacyjny;
  - przyklejony, półprzezroczysty nagłówek: nazwa sklepu rozstrzelonym szeryfem z kropką w kolorze akcentu (albo logo sklepu), menu z podkreśleniem aktywnej pozycji, wyszukiwarka-pigułka, ulubione, przycisk konta i koszyk z licznikiem;
  - fonty Cormorant Garamond (nagłówki) i Plus Jakarta Sans (tekst), samohostowane.
- **Strona główna (sekcje):**
  - baner „Magazyn”: nadtytuł, duży nagłówek, dwa kwadratowe przyciski, wysokie zdjęcie i pływająca karta najnowszego produktu;
  - „Kafelki ze zdjęciami” (2–4, z linkiem);
  - „Produkty” z filtrami kategorii głównych, przyciskiem Promocje i sortowaniem bez przeładowania strony;
  - „Baner na zdjęciu”;
  - newsletter (double opt-in).
- **Karta produktu:**
  - zdjęcie 3:4;
  - plakietka „Promocja” / „Wyprzedane”;
  - „+ Do koszyka” po najechaniu (na telefonie widoczne stale); dodaje od razu tylko produkt bez wariantów, a przy rozmiarach otwiera stronę produktu;
  - informacja Omnibus.
- **Strona produktu:** pionowe miniatury obok zdjęcia 3:4, większy szeryfowy tytuł, przycisk w stylu szablonu; po dodaniu otwiera się boczny koszyk.
- **Boczny koszyk:**
  - prawdziwy koszyk z serwera: ilości i usuwanie;
  - pasek „do darmowej dostawy” liczony z najniższego progu „darmowa od” w sposobach dostawy sklepu (gdy sklep go nie ma, paska nie ma);
  - przejście do kasy.
- **Stopka:**
  - marka z opisem i social media;
  - kolumna „Zakupy”;
  - kolumna „Obsługa klienta” (konto i strony sklepu: regulamin, polityka prywatności…);
  - newsletter;
  - dane sprzedawcy.

## Silnik v2 (od 2026-11-28)

Bawiloo jest renderowane przez nowy silnik szablonów (docs/TEMPLATE_FORMAT.md): HTML i CSS z pliku projektanta (`bawiloo-sklep-jasny-premium.html`) podzielone na sekcje w `templates/bawiloo/`, 1:1 z projektem. Opis poniżej dotyczy wcześniejszej wersji w silniku Angular (zostaje do czasu przeniesienia edytora — etap 3).

Ograniczenia etapu 1:
- edytor w panelu nadal zapisuje ustawienia starego silnika, a strona v2 pokazuje domyślną treść szablonu (edytor v2 w etapie 3);
- strony zamówienia, konta, CMS i bloga są jeszcze z aplikacji Angular (płatność w wyglądzie szablonu — etap 2);
- w podglądzie z panelu (`?podglad=`) linki między stronami nie przenoszą tokenu podglądu.

## Bawiloo — co ma (drugi szablon, zabawki)

Od 2026-11-27 Bawiloo jest **jasne** (wersja z nowego `index.html` od właściciela projektu): kremowe tło, białe karty, ciemnobrązowy tekst i złoty nagłówek.

- **Nagłówek i stopka:**
  - złoty gradient z koloru akcentu; tekst w kolorze `--sf-on-accent` (ciemny na jasnym złocie, biały na ciemnym akcencie);
  - zaokrąglone logo w kroju Baloo 2 (Fredoka z oryginału nie ma polskich liter);
  - pogrubione menu wielkimi literami z ciemną pigułką „Promocje”;
  - stopka na kremowym tle (`bg-sf-surface`) z logo w kolorze `--sf-accent-ink`.
- **Baner „Radosny”:** ogromny napis, ciemny przycisk-pigułka, wycięte zdjęcie zabawek (WebP z przezroczystością) i falowana dolna krawędź.
- **„Ulubione zabawki dzieci”:** sekcja *Kategorie* w stylu **„Zdjęcia bez tła (w jednej linii)”** (`cutouts`) — prawdziwe kategorie główne sklepu.
  - Zdjęcie kategorii stoi swobodnie, bez ramki i koła. Na jasnym tle zdjęcie jest mieszane trybem `multiply`, więc białe tło JPEG-a znika (biblioteka zdjęć zapisuje JPEG bez przezroczystości).
  - Po najechaniu zdjęcie lekko unosi się, a podpis zmienia kolor.
  - W jednej linii mieszczą się 3 kategorie na telefonie, 4 na tablecie i 6 na komputerze. „Zobacz więcej” pokazuje resztę i jest widoczny tylko wtedy, gdy coś się nie zmieściło.
  - Dodanie przykładowych produktów tworzy te kategorie razem ze zdjęciami.
- **Produkty:**
  - wyśrodkowany nagłówek z ✦ nadtytułem i przechyloną złotą drugą linią;
  - białe karty z kwadratowym zdjęciem na pastelowym tle, ceną w kolorze `--sf-accent-ink`, pigułką „Do koszyka” i znaczkiem −% przy promocjach; karta unosi się po najechaniu.
- **Slider promocji** (styl sekcji *Produkty* „Slider z wyróżnionym produktem”, komponent `ui/spotlight-carousel.ts`):
  - na kremowym pasie na całą szerokość; jeden duży produkt w środku i mniejsi sąsiedzi po bokach;
  - strzałki, kropki, klawiatura (← →), przesuwanie palcem lub myszą; lista jest zapętlona;
  - kliknięcie środkowego produktu otwiera jego stronę, kliknięcie bocznego przesuwa go na środek;
  - czytnik ekranu dostaje komunikat „Produkt 2 z 8: …”, a boczne slajdy są poza kolejnością Tab;
  - na telefonie środkowy produkt jest duży, a sąsiedzi tylko wystają zza krawędzi;
  - bez animacji, gdy system prosi o ograniczenie ruchu.
  - Ten sam styl działa w każdym szablonie (wcześniej „Karuzela”).
- **Korzyści:** złote, ilustrowane ikony z wersji „premium” paczki (płatności, zwroty, dostawa, pomoc) — `ui/premium-icon.ts`.
- **„O nas”:** zdjęcie w kształcie kwiatka. Na zdjęciu szablonu szyld pokazuje nazwę sklepu, bo oryginalny napis na zdjęciu jest nim przykryty.
- **Newsletter:** karta z jasnozłotym gradientem i formularzem (double opt-in).
- **Przykłady:** 16 przykładowych zabawek: 6 figurek, 5 pluszaków w promocji i 5 zabawek dla maluchów. Widać je w podglądzie demo szablonu albo w sklepie po dodaniu przyciskiem.

### Koszyk: wysuwany panel albo osobna strona (każdy szablon)

Ustawienie **Koszyk** w edytorze (grupa „Koszyk”, klucz `cartStyle`):
- **Wysuwany panel z boku** (`drawer`, domyślne w obu szablonach):
  - ikona koszyka i dodanie produktu otwierają panel z boku, a klient zostaje na stronie;
  - w panelu są podpowiedzi produktów i próg darmowej dostawy.
- **Osobna strona koszyka** (`page`):
  - ikona koszyka to link do `/koszyk`, a panelu nie ma na stronie;
  - po dodaniu produktu z karty widać „Dodano do koszyka. Zobacz koszyk”, a na stronie produktu „Przejdź do koszyka”.

Konfiguracje zapisane przed dodaniem ustawienia dostają wartość domyślną (panel), bo ustawienia są przy odczycie łączone z domyślnymi wartościami szablonu.

### Czytelność kolorów (każdy szablon)

Sprzedawca może ustawić dowolne kolory, więc witryna sama dobiera kolory tekstu:
- `--sf-on-accent`: tekst na kolorze akcentu. To kolor tekstu sklepu, jeśli ma kontrast co najmniej 4,5:1; w przeciwnym razie biały albo czarny.
- `--sf-accent-ink`: akcent przyciemniony (albo rozjaśniony na ciemnym tle) do kontrastu 4,5:1 z tłem. Używają go ceny, nadtytuły i złote podpisy, bo jasne złoto na kremowym tle byłoby nieczytelne.
- `--sf-danger` i `--sf-success` dopasowują się do jasnego lub ciemnego tła (`data-tone` na stronie).

### Sklepy z wcześniejszą, ciemną wersją Bawiloo

Kolory są zapisane w ustawieniach sklepu, więc sklep, który wybrał ciemne Bawiloo, zachowuje swoje kolory i nadal wygląda czytelnie.
Żeby przejść na jasną wersję, sprzedawca wybiera Bawiloo ponownie w galerii szablonów albo zmienia kolory w edytorze.
Styl kategorii zostaje taki, jaki był zapisany („Okrągłe zdjęcia”); „Zdjęcia bez tła” wybiera się w edytorze.

### Czego z HTML-a celowo nie przeniesiono

Z pierwotnego HTML-a Véry pominęliśmy atrapy, bo w sklepie są już prawdziwe funkcje.
W Bawiloo podobnie: demonstracyjne logowanie, zamówienia, „Dostawa (demo) — gratis” i newsletter zastępują prawdziwe funkcje sklepu, a hasło „Darmowa dostawa” w korzyściach zmieniliśmy na „Szybka dostawa”, żeby szablon niczego nie obiecywał za sprzedawcę.

- **Logowanie przez Google:** nie ma tu prawdziwego OAuth; jest prawdziwe konto klienta.
- **Modal z przykładowymi zamówieniami:** zamówienia są na stronie konta.
- **Tabela rozmiarów zapisana na sztywno:** sprzedawca może dodać własną stronę i podlinkować ją w menu.
- **Kod rabatowy w pasku informacyjnym:** tekst paska ustawia sprzedawca; nie obiecujemy rabatu, którego sklep nie ma.

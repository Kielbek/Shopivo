# Szablony sklepu — jak są zbudowane i gdzie leżą ich grafiki

Ten dokument opisuje, jak dodajemy kolejne szablony (pierwszy z własnym kodem i grafikami: **Véra**). Każdy szablon ma
swój wygląd, własne komponenty i własne zdjęcia. Sprzedawca widzi je od razu w edytorze i może każde podmienić.

## Trzy warstwy szablonu

| Warstwa | Gdzie | Co zawiera |
|---|---|---|
| **Manifest** | `backend/.../themes/ThemeRegistry.java` (preset) | kod, nazwa, domyślne ustawienia (kolory, krój, nagłówek…), domyślne sekcje strony głównej z tekstami i odnośnikami do grafik szablonu |
| **Grafiki** | `backend/src/main/resources/themes/<kod>/<nazwa>-w400.jpg` i `-w1200.jpg`, rejestr w `ThemeAssets.java` | zdjęcia dostarczane z szablonem (baner, kafelki, baner „pracownia”…); źródła i licencje w [THEME_ASSETS.md](THEME_ASSETS.md) |
| **Kod** | `frontend/apps/storefront/src/app/themes/<kod>/` + wspólne sekcje w `ui/sections.ts` | komponenty, które szablon ma inne niż standardowy układ (u Véry: nagłówek, stopka, boczny koszyk); karta produktu i strona produktu mają wariant zależny od `StoreState.layout()` |

Szablony bez własnego kodu (Atelier, Róża, Volt…) korzystają ze standardowego układu i różnią się ustawieniami oraz sekcjami.

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

## Bawiloo — co ma (drugi szablon, zabawki)

- **Nagłówek i stopka:** złoty gradient (z koloru akcentu); zaokrąglone logo Fredoka; pogrubione menu wielkimi literami z pigułką „Promocje”; ciemna stopka ze złotym logo.
- **Baner „Radosny”:** ogromny napis, ciemny przycisk-pigułka, wycięte zdjęcie zabawek (WebP z przezroczystością) i falowana dolna krawędź.
- **Kafelki „okrągłe”:** 6 działów ze zdjęciami w kółkach i przyciskiem „Zobacz więcej”.
- **Produkty:**
  - wyśrodkowany nagłówek z ✦ nadtytułem i przechyloną złotą drugą linią;
  - ciemne karty z kwadratowym zdjęciem, złotą ceną, pigułką „Do koszyka” i znaczkiem −% przy promocjach;
  - sekcja promocji jako **karuzela** (przewijanie z przyciągnięciem i strzałki).
- **Korzyści:** złote, ilustrowane ikony z wersji „premium” paczki (płatności, zwroty, dostawa, pomoc) — `ui/premium-icon.ts`.
- **„O nas”:** zdjęcie w kształcie kwiatka. Na zdjęciu szablonu szyld pokazuje nazwę sklepu, bo oryginalny napis na zdjęciu jest nim przykryty.
- **Newsletter:** duża złota karta z formularzem (double opt-in).
- **Przykłady:** 16 przykładowych zabawek: 6 figurek, 5 pluszaków w promocji i 5 zabawek dla maluchów.
- **Ciemne tło:** kolory statusów (`--sf-danger`, `--sf-success`) rozjaśniają się automatycznie, żeby pozostać czytelne.

### Czego z HTML-a celowo nie przeniesiono

Z pierwotnego HTML-a Véry pominęliśmy atrapy, bo w sklepie są już prawdziwe funkcje.
W Bawiloo podobnie: demonstracyjne logowanie, zamówienia, „Dostawa (demo) — gratis” i newsletter zastępują prawdziwe funkcje sklepu, a hasło „Darmowa dostawa” w korzyściach zmieniliśmy na „Szybka dostawa”, żeby szablon niczego nie obiecywał za sprzedawcę.

- **Logowanie przez Google:** nie ma tu prawdziwego OAuth; jest prawdziwe konto klienta.
- **Modal z przykładowymi zamówieniami:** zamówienia są na stronie konta.
- **Tabela rozmiarów zapisana na sztywno:** sprzedawca może dodać własną stronę i podlinkować ją w menu.
- **Kod rabatowy w pasku informacyjnym:** tekst paska ustawia sprzedawca; nie obiecujemy rabatu, którego sklep nie ma.

# Polecanie produktów

Moduł `recommendations` układa produkty na podstawie danych samego sklepu: zamówień, opinii, stanów i ruchów magazynowych oraz kategorii. Nie korzysta z usług zewnętrznych ani z danych osobowych, nie wymaga też zgody na cookies.

## Gotowe listy — `GET /api/v1/storefront/collections/{źródło}`

| Źródło | Algorytm | Uzupełnianie |
|---|---|---|
| `bestsellery` | Sztuki z niezanulowanych zamówień z 60 dni. Każda sprzedaż ma wagę 0,5^(wiek w dniach / 7), więc waga spada o połowę co tydzień. | nowościami (sklep bez historii też ma listę) |
| `promocje` | Największa obniżka w %: (cena przed obniżką − cena) / cena przed obniżką. | nie — lista zawiera tylko prawdziwe promocje |
| `koncowki` | 1–3 sztuki na stanie, bez sprzedaży „na zamówienie”; najpierw te, które ostatnio się sprzedawały. | nie |
| `nowosci` | Data publikacji. | — |
| `najlepiej-oceniane` | Średnia bayesowska zatwierdzonych opinii: (3 × średnia sklepu + suma ocen) / (3 + liczba opinii). Pojedyncza ocena 5★ nie wygrywa z wieloma ocenami 4,8★. | nowościami |
| `wracaja` | Stan wzrósł z 0 do > 0 w ostatnich 14 dniach (przyjęcie, zwrot, korekta). | nie |

`?kategoria=slug` zawęża każdą listę do kategorii razem z podkategoriami.

## Przy produkcie i w koszyku

- **`/products/{slug}/bought-together`** — dla każdego produktu B:
  - liczymy wspólne koszyki z produktem A z 365 dni (bez anulowanych zamówień);
  - wynik = wspólne koszyki / √(wszystkie zamówienia z B), żeby bestseller sklepu nie trafiał wszędzie;
  - zwracamy **tylko prawdziwe pary**, więc nagłówek „Często kupowane razem” jest zgodny z prawdą.
- **`/products/{slug}/similar`** — kolejność:
  1. wspólne kategorie;
  2. cena w granicach ±30%;
  3. bliższa cena;
  4. ta sama marka.
- **`/recommendations/cart?ids=…&brakuje=…`** — źródła podpowiedzi:
  - produkty kupowane razem z zawartością koszyka (waga ×2);
  - produkty z tych samych kategorii;
  - bestsellery.

  Najpierw idą produkty w cenie od brakującej kwoty do 1,5× tej kwoty, ułożone od najbliższej ceny. Witryna obiecuje „darmową dostawę” tylko wtedy, gdy pierwszy produkt naprawdę domyka próg.

## Zasady

- Wszystkie listy zawierają wyłącznie produkty aktywne i dostępne. Ceny i dostępność są zawsze aktualne, bo pochodzą z katalogu.
- Rankingi (listy id) są trzymane w pamięci podręcznej przez 2 minuty na sklep. Nowe lub anulowane zamówienie czyści je od razu.
- Odpowiedzi HTTP mają `Cache-Control: max-age=60`, a podgląd sklepu ma `no-store`.
- Indeksy dla tych zapytań dodaje migracja `V23__recommendation_indexes.sql`.

## Gdzie to widać

- **Edytor wyglądu, sekcja „Produkty”, opcja „Jakie produkty”:** bestsellery, promocje (największe obniżki), ostatnie sztuki, najlepiej oceniane, wróciły do sprzedaży.
  - Filtry kategorii w sekcji zawężają ranking, np. do „bestsellerów w Pluszakach”.
  - Bawiloo używa bestsellerów w sekcji „Małe figurki”.
- **Strona produktu:** „Często kupowane razem” oraz „Może Ci się spodobać”, bez powtórzeń między tymi sekcjami.
- **Boczny koszyk:** „Dodaj do zamówienia” z przyciskiem „+ Dodaj”. Produkt bez wariantów trafia do koszyka od razu; przy rozmiarach otwiera się strona produktu.
- **Strona koszyka:** rząd „Dodaj do zamówienia”.

## Czego jeszcze nie ma (etap 3)

- Personalizacja („Dla Ciebie”) i zliczanie wyświetleń. Wymaga to nowych danych i zgody klienta w banerze cookies.
- W panelu: przypinanie i wykluczanie produktów z poleceń oraz statystyka zamówień z poleceń.

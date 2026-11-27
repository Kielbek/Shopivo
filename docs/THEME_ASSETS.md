# Grafiki i fonty szablonów — źródła i licencje

## Zdjęcia (backend/src/main/resources/themes/)

Pobrane jednorazowo z Unsplash (2026-11-27) w dwóch szerokościach: 400 i 1200 px, JPEG.
Na **licencji Unsplash** (https://unsplash.com/license) wolno je bezpłatnie kopiować, modyfikować i rozpowszechniać, także komercyjnie, bez obowiązku podawania autora. Nie wolno sprzedawać ich bez istotnej modyfikacji ani budować z nich konkurencyjnego serwisu ze zdjęciami. Tu są przykładowymi grafikami szablonu, które sprzedawca zastępuje własnymi.

| Odnośnik | Plik | Źródło (Unsplash) |
|---|---|---|
| `tpl:vera/hero` | `vera/hero-w*.jpg` | `images.unsplash.com/photo-1490481651871-ab68de25d43d` |
| `tpl:vera/women` | `vera/women-w*.jpg` | `images.unsplash.com/photo-1483985988355-763728e1935b` |
| `tpl:vera/men` | `vera/men-w*.jpg` | `images.unsplash.com/photo-1617137968427-85924c800a22` |
| `tpl:vera/accessories` | `vera/accessories-w*.jpg` | `images.unsplash.com/photo-1584917865442-de89df76afd3` |
| `tpl:vera/atelier` | `vera/atelier-w*.jpg` | `images.unsplash.com/photo-1441984904996-e0b6ba687e04` |

Zdjęcia przykładowych produktów (`tpl:vera/p-*`, kadr 3:4) — to samo źródło i ta sama licencja:

| Odnośnik | Źródło (Unsplash) |
|---|---|
| `tpl:vera/p-coat` | `photo-1539533018447-63fcce2678e3` |
| `tpl:vera/p-sweater` | `photo-1520903920243-00d872a2d1c9` |
| `tpl:vera/p-blazer` | `photo-1593030761757-71fae45fa0e7` |
| `tpl:vera/p-bag` | `photo-1591561954557-26941169b49e` |
| `tpl:vera/p-shirt` | `photo-1596755094514-f87e34085b2c` |
| `tpl:vera/p-dress` | `photo-1595777457583-95e059d581b8` |
| `tpl:vera/p-chinos` | `photo-1473966968600-fa801b869a1a` |
| `tpl:vera/p-jacket` | `photo-1544022613-e87ca75a784a` |

Pominięto zdjęcie koszulki z cudzą grafiką/napisem z pierwotnego HTML-a, bo był na niej nadruk innej marki.

## Bawiloo (backend/src/main/resources/themes/bawiloo/)

Grafiki dostarczone przez właściciela projektu razem z szablonem (paczka „bawiloo-kompletny-sklep(-premium)”, 2026-11-27):
- banner z zabawkami, 6 grafik kategorii, zdjęcie sklepu „O nas”;
- 16 zdjęć produktów;
- ilustrowane ikony korzyści (SVG, w kodzie `ui/premium-icon.ts`).

Przetworzenie:
- przeskalowano do wariantów 400/1200 px;
- baner zostawiono w WebP z przezroczystością;
- pozostałe pliki zapisano jako JPEG, przezroczyste produkty na tle w ich kolorze z szablonu.

Jasna wersja szablonu (nowy `index.html`, 2026-11-27):
- grafiki kategorii (`cat-*`) to wycięte z tła zabawki na białym tle (JPEG), żeby na stronie wyglądały jak zdjęcia bez tła;
- wycięto je skryptem z dotychczasowych zdjęć kategorii z paczki: tło usunięto wypełnieniem od krawędzi i maską okręgu;
- zdjęcia wycięć dołączone później do wiadomości nie były dostępne jako pliki, więc nie trafiły do repozytorium; po przesłaniu ich jako plików można je podmienić;
- zdjęcia produktów (`p-*`) mają teraz pastelowe tło w kolorze z szablonu, z marginesem i miękkim cieniem.

Prawa do grafik — po stronie dostawcy szablonu.
Uwaga: na zdjęciu „O nas” jest napis „Whimsy”; szablon przykrywa go szyldem z nazwą sklepu, ale tylko na tym jednym zdjęciu.

## Fonty (frontend/apps/storefront/public/fonts/)

| Krój | Pliki | Licencja | Źródło |
|---|---|---|---|
| Cormorant Garamond 500/600/700 | `cormorant-garamond-latin(-ext)-*.woff2` | SIL Open Font License 1.1 (`OFL-cormorant-garamond.txt`) | npm `@fontsource/cormorant-garamond@5.3.0` |
| Baloo 2 (zmienna 400–800) | `baloo-2-latin(-ext)-wght-normal.woff2` | SIL OFL 1.1 (`OFL-baloo-2.txt`) | npm `@fontsource-variable/baloo-2@5.3.0` |
| Nunito Sans (zmienna 200–1000) | `nunito-sans-latin(-ext)-wght-normal.woff2` | SIL OFL 1.1 (`OFL-nunito-sans.txt`) | npm `@fontsource-variable/nunito-sans@5.3.0` |
| Plus Jakarta Sans (zmienna 200–800) | `plus-jakarta-sans-latin(-ext)-wght-normal.woff2` | SIL Open Font License 1.1 (`OFL-plus-jakarta-sans.txt`) | npm `@fontsource-variable/plus-jakarta-sans@5.3.0` |

Fredoka z pierwotnego szablonu Bawiloo nie ma liter Ą, Ę ani Ż (sprawdzone w plikach fontu), więc zastąpiono go podobnym, zaokrąglonym Baloo 2 z pełnym polskim alfabetem. Każdy font szablonu trzeba sprawdzić pod kątem polskich znaków (ĄĆĘŁŃÓŚŹŻ), zanim trafi do sklepu.

Fonty są serwowane przez witrynę sklepu, bez zapytań do Google Fonts (adres IP odwiedzającego nie trafia do podmiotów trzecich).

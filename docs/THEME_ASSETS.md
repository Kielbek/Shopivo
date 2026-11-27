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

Zdjęć produktów z pierwotnego HTML-a nie dołączamy: produkty w sklepie mają zdjęcia wgrane przez sprzedawcę.

## Fonty (frontend/apps/storefront/public/fonts/)

| Krój | Pliki | Licencja | Źródło |
|---|---|---|---|
| Cormorant Garamond 500/600/700 | `cormorant-garamond-latin(-ext)-*.woff2` | SIL Open Font License 1.1 (`OFL-cormorant-garamond.txt`) | npm `@fontsource/cormorant-garamond@5.3.0` |
| Plus Jakarta Sans (zmienna 200–800) | `plus-jakarta-sans-latin(-ext)-wght-normal.woff2` | SIL Open Font License 1.1 (`OFL-plus-jakarta-sans.txt`) | npm `@fontsource-variable/plus-jakarta-sans@5.3.0` |

Fonty są serwowane przez witrynę sklepu, bez zapytań do Google Fonts (adres IP odwiedzającego nie trafia do podmiotów trzecich).

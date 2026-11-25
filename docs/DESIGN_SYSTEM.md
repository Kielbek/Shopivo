# Shopivo — system projektowy interfejsów administracyjnych

Dotyczy panelu sprzedawcy i panelu administratora platformy. **Witryny sklepów (storefront) mają własne motywy**
i nie korzystają z tych tokenów.

Źródło: `frontend/libs/shared-ui` (`styles/theme.css` + komponenty). Inspiracja wizualna: referencja „E-COM dashboard”
(jasne tło strony, biała zaokrąglona powierzchnia aplikacji, biały sidebar, karty KPI z kolorowymi kółkami).

## Tokeny (Tailwind `@theme`)

| Token | Wartość | Użycie |
|---|---|---|
| `page` | `#F3F5F9` | tło strony |
| `canvas` | `#F5F6F8` | tło obszaru treści, nagłówki tabel |
| `card` | `#FFFFFF` | karty, sidebar, nagłówek |
| `ink` | `#252B3B` | tekst główny |
| `ink-soft` | `#5B6478` | tekst drugorzędny (pochodny — kontrast AA) |
| `ink-muted` | `#8992A5` | etykiety meta, placeholdery, ikony |
| `line` / `line-strong` | `#EDF0F4` / `#DFE3EA` | obramowania kart / pól |
| `primary` / `primary-strong` | `#5B8DEF` / `#3E6FD8` | akcent, wykresy / przyciski (biały tekst AA) |
| `violet`, `success`, `warning`, `danger` | `#A58AF7`, `#36CFA5`, `#FFB86B`, `#F47C87` | + warianty `-soft` (tła) i `-ink` (tekst) |
| `--radius-card` / `--radius-control` | 14 px / 9 px | karty / przyciski, pola |

Kontrast: `#8992A5` na bieli ma 3,2:1, a biały na `#5B8DEF` 3,3:1 — poniżej WCAG AA dla tekstu 13–14 px, dlatego
dodano tokeny pochodne `ink-soft` i `primary-strong` do tekstu i przycisków.

Typografia: Inter (self-hosted, `@fontsource-variable/inter` — bez Google Fonts ze względu na RODO), 13–14 px w
treści, 22 px tytuły stron, 15 px tytuły kart. Ikony: Lucide (`@lucide/angular`), rejestr w `lib/icons.ts`,
18 px w nawigacji, obrys 1,75.

## Komponenty

| Komponent | Selektor | Uwagi |
|---|---|---|
| Powłoka aplikacji | `sv-app-shell` | sidebar z sekcjami + przypięta grupa dolna, nagłówek z wyszukiwarką nawigacji (`/`), sloty na przełączniki, szuflada < 1024 px |
| Karta | `sv-card` | `heading`, `subheading`, `[card-actions]`, `flush` dla tabel |
| Karta KPI | `sv-stat-card` | `value=null` → jawny stan „brak danych” |
| Wykres liniowy | `sv-line-chart` | SVG, interpolacja monotoniczna, gradient, podpowiedzi; pusty stan przez projekcję |
| Wykres pierścieniowy | `sv-donut-chart` | legenda z procentami |
| Menu | `sv-menu` + `sv-menu-item` | klawiatura, Esc, klik poza |
| Okres | `sv-date-range` | natywny `select` (dostępność) |
| Zakładki | `sv-tabs` | segmented control, wzorzec WAI-ARIA tabs (strzałki) |
| Powiadomienia | `ToastService` + `sv-toast-outlet` | `aria-live` |
| Pozostałe | `sv-button`, `sv-field`, `sv-alert`, `sv-badge`, `sv-avatar`, `sv-dialog`, `sv-empty-state`, `sv-loading`, `sv-skeleton`, `sv-section`, `sv-page-header` | |

Klasy pomocnicze: `.sv-input`, `.sv-label`, `.sv-checkbox`, `.sv-switch`, `.sv-card-footer`, `.sv-table`, `.sv-link`.

## Formularze (język referencji)
- Kontrolki **wypełnione** (`#F3F5F8`, bez widocznej ramki, 40 px, promień 10 px); ramka w kolorze akcentu dopiero przy fokusie.
- Etykiety 12,5 px `ink-soft`; pól opcjonalnych **nie oznaczamy** (większość jest opcjonalna) — błędy walidacji pod polem.
- Formularz = karta: tytuł + krótki podpis w nagłówku, pola w siatce 2-kolumnowej, akcje w stopce (`.sv-card-footer`),
  „Zapisz” aktywne dopiero po zmianie, „Odrzuć zmiany” przywraca stan z serwera.
- Długie ustawienia dzielimy zakładkami `sv-tabs` (segmented control), a nie układem „opis po lewej / pola po prawej”.
- Przełączniki opcji tak/nie: `.sv-switch` (natywny checkbox z `role="switch"`).

## Czego unikamy (wzorce „szablonowe”)
- Zdań-opisów pod każdym tytułem strony, powtarzalnych plakietek na każdej pozycji menu, ikon w kółkach przy każdym pustym
  stanie, nagłówków sekcji wielkimi literami. Puste stany są krótkie i ciche (ikona + jedno zdanie).

## Zasady
- Bez danych przykładowych: widżety bez źródła danych pokazują stan pusty; moduły planowane są w nawigacji
  wyszarzone (dla czytników ekranu: „wkrótce”) i nie są linkami.
- Nawigacja panelu sprzedawcy jest filtrowana uprawnieniami roli (backend i tak je egzekwuje).
- Panele działają od 320 px; tabele przewijają się w obrębie karty, bez poziomego przewijania strony.
- Brak skryptów inline (CSP `script-src 'self'`).

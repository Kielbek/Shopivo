# Shopivo — system projektowy interfejsów administracyjnych

Dotyczy panelu sprzedawcy i panelu administratora platformy. **Witryny sklepów (storefront) mają własne motywy**
i nie korzystają z tych tokenów.

Źródło: `frontend/libs/shared-ui` (`styles/theme.css` + komponenty). Kierunek (2026-11-27): czarna kolumna
nawigacji, neonowa zieleń wyłącznie jako akcent, czarne przyciski domyślne, spokojna ciepło-szara
powierzchnia robocza jako zaokrąglony panel (18 px) z odstępem 10 px od góry, prawej i dołu — odstęp ma kolor nawigacji, panel przewija się
sam (po zmianie strony wraca na górę, zmiana filtrów nie przewija).

## Tokeny (Tailwind `@theme`)

| Token | Wartość | Użycie |
|---|---|---|
| `--nav-bg`, `nav-*` | `#0F1210`; tekst `#E7EAE5`, przygaszony `#8E958D` | tło nawigacji i ramki (czarne, wybrane spośród 5 wariantów), aktywna pozycja `nav-active` = neon; cała paleta paska w jednym miejscu w `theme.css` |
| `neon` / `neon-deep` | `#B5F23D` / `#9FDE24` | aktywna pozycja menu, przycisk `accent`, kropka nad „ı” w logo — **tylko jako wypełnienie z czarnym tekstem**, nigdy tekst na bieli |
| `night` / `night-3` | `#0F1210` / `#262B27` | przycisk `primary`, przełączniki, ciemne plakietki |
| `canvas` / `card` | `#F2F3F0` / `#FFFFFF` | tło treści / karty, nagłówek |
| `ink` / `ink-soft` / `ink-muted` | `#161916` / `#575D58` / `#8A8F88` | tekst / tekst drugorzędny (AA) / meta i ikony |
| `line` / `line-strong` | `#E8EAE5` / `#D8DBD4` | obramowania |
| `primary` / `primary-strong` | `#4C9A1B` / `#2E6B0F` | zielone ikony i paski postępu / linki i zielony tekst (6,4:1) |
| `info` (`-soft`, `-ink`) | `#3D7BEA` | plakietki informacyjne (np. „Szkic”) — odróżnione od zielonego „sukcesu” |
| `success`, `warning`, `danger`, `violet` | | + warianty `-soft` (tła) i `-ink` (tekst) |
| `--radius-card` / `--radius-control` | 16 px / 10 px | karty / pola; **przyciski, zakładki, wyszukiwarka i plakietki — pigułki** (`rounded-full`); okna dialogowe 20 px |

Przyciski: `primary` (czarny) to domyślna akcja; `accent` (neon) — jedna kluczowa akcja ekranu: publikacja sklepu,
motywu i strony, utworzenie sklepu. Karty KPI są monochromatyczne (liczby, nie dekoracja niosą znaczenie).

Nawigacja: w obszarze **Ustawień** (Ogólne, Dane firmy, Płatności, Wysyłka i dostawa, Integracje, Zespół, Plan, Dziennik) główne menu zwija
się do ikon, a obok otwiera się kolumna ustawień (na telefonie — przewijany pasek nad treścią). **Edytor wyglądu** ma
tę samą zwiniętą kolumnę ikon (wyjście przez nią pyta o niezapisane zmiany). Moduły „wkrótce” są widoczne tylko w
kolumnie ustawień, nie zaśmiecają głównego menu.

Typografia: Inter (self-hosted, `@fontsource-variable/inter` — bez Google Fonts ze względu na RODO), 13–14 px w
treści, 22 px tytuły stron, 15 px tytuły kart. Ikony: Lucide (`@lucide/angular`), rejestr w `lib/icons.ts`,
18 px w nawigacji, obrys 1,75.

Strony ustawień (wzór Shopify): jedna wyśrodkowana kolumna (840 px); nad każdą kartą tytuł i opis sekcji; listy jako
wiersze `.settings-item` (ikona, nazwa, szara plakietka statusu `.settings-pill`, strzałka / rozwinięcie); pusta sekcja —
`.sv-empty-box` (przerywana ramka + mały szary przycisk `variant="tonal"`); zmiany w formularzu — jeden pływający pasek
„Niezapisane zmiany · Odrzuć · Zapisz”. Sposoby dostawy i metody płatności są oddzielone od **Integracji** (konta
przewoźników i operatorów płatności).

Logo: sam napis „shopıvo” w kroju Inter (bez sygnetu), kropka nad „ı” neonowa na ciemnym tle i zielona na jasnym;
w zwiniętej nawigacji skrót „s.”. Ikona aplikacji (favicon, apple-touch, PWA): czarny kwadrat, białe „s”, neonowa
kropka — `public/favicon.svg|.ico`, `apple-touch-icon.png`, `icon-192/512.png`, `manifest.webmanifest`.

Ikony nawigacji: Hugeicons stroke-rounded (MIT, `lib/nav-icon-paths.ts` generowane z `@hugeicons/core-free-icons`
1.0.10) — miękkie, zaokrąglone kształty (`sv-nav-icon`); pozostałe ikony interfejsu: Lucide. W zwiniętej nawigacji
nazwy pokazuje dymek `svTooltip` (renderowany na `<body>`, więc nie ucina go przewijana lista). Treść stron jest biała,
karty z cienką ramką bez cienia, pola białe z ramką, lżejsze wagi kroju (medium 480, semibold 560).

## Komponenty

| Komponent | Selektor | Uwagi |
|---|---|---|
| Powłoka aplikacji | `sv-app-shell` | kolumna nawigacji z wyszukiwarką (`/`), sekcjami i przypiętą grupą dolną; `rail` (zwinięta do ikon), `hasSubnav` + `[shell-subnav]` (kolumna sekcji), `narrow`; szuflada < 1024 px |
| Karta | `sv-card` | `heading`, `subheading`, `[card-actions]`, `flush` dla tabel |
| Karta KPI | `sv-stat-card` | monochromatyczna; `value=null` → jawny stan „brak danych” |
| Wykres liniowy | `sv-line-chart` | SVG, interpolacja monotoniczna, gradient, podpowiedzi; pusty stan przez projekcję |
| Wykres pierścieniowy | `sv-donut-chart` | legenda z procentami |
| Menu | `sv-menu` + `sv-menu-item` | klawiatura, Esc, klik poza |
| Lista wyboru | `sv-select` | zamiast natywnego `select`: panel pod polem (desktop) / arkusz od dołu (< 640 px), opisy opcji, wyszukiwarka > 8 opcji, Reactive Forms/ngModel, klawiatura i ARIA combobox/listbox, Popover API (nie ucina go tabela ani dialog) |
| Okres | `sv-date-range` | na `sv-select` z ikoną kalendarza |
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

## Ruch i gesty (mobile)
- Arkusz wyboru: wjazd od dołu (280 ms), wyjazd (220 ms), wygaszanie tła; zamykanie przeciągnięciem w dół za uchwyt
  lub listę przewiniętą do góry. Zamknięcie po przekroczeniu 30% wysokości albo szybkim „rzucie” (> 0,5 px/ms),
  w przeciwnym razie sprężyste odbicie.
- Menu boczne: wysuwanie/chowanie (300 ms), tło zanika proporcjonalnie do przesunięcia, zamykanie przesunięciem w lewo.
- Wspólny mechanizm: `attachSwipeToDismiss` (`lib/gestures.ts`) — kierunek rozstrzygany po 6 px, ruch prostopadły zostaje
  przewijaniem.
- `prefers-reduced-motion: reduce` wyłącza animacje i przejścia.

## Czego unikamy (wzorce „szablonowe”)
- Zdań-opisów pod każdym tytułem strony, powtarzalnych plakietek na każdej pozycji menu, ikon w kółkach przy każdym pustym
  stanie, nagłówków sekcji wielkimi literami. Puste stany są krótkie i ciche (ikona + jedno zdanie).

## Zasady
- Bez danych przykładowych: widżety bez źródła danych pokazują stan pusty; moduły planowane są w nawigacji
  wyszarzone (dla czytników ekranu: „wkrótce”) i nie są linkami.
- Nawigacja panelu sprzedawcy jest filtrowana uprawnieniami roli (backend i tak je egzekwuje).
- Panele działają od 320 px; tabele przewijają się w obrębie karty, bez poziomego przewijania strony.
- Brak skryptów inline (CSP `script-src 'self'`).

## Stany wczytywania (2026-11-26)
Produkt nie używa spinnerów. Wczytywanie = szkielet w kształcie treści (`<sv-loading variant="list|table|form|cards|detail|page|text">`,
klasa `.sv-shimmer`), karty statystyk mają `[loading]`, przycisk w trakcie akcji (`[loading]`) zachowuje etykietę i dostaje
połysk (`.sv-btn-busy`), `aria-busy` i tekst dla czytników ekranu. W sklepie klienta: `.sf-shimmer` (kolor z motywu).
Animacje są wyłączane przy `prefers-reduced-motion`.

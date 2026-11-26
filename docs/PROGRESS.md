# Shopivo — postęp prac

Ostatnia aktualizacja: 2026-11-25 · Ukończone: **Faza 0**, **Faza 1**, **Faza 2**, **Faza 3** (z ograniczeniami opisanymi niżej).

## Wyniki testów (rzeczywiście uruchomione)

| Zestaw | Polecenie | Wynik |
|---|---|---|
| Backend — testy jednostkowe (surefire) | `cd backend && ./mvnw verify` | 35/35 ✔ |
| Backend — testy integracyjne (failsafe, Testcontainers PostgreSQL 17 + Redis 7) | jw. | 52/52 ✔ |
| Frontend — Vitest (3 aplikacje) | `cd frontend && npm test` | 44/44 ✔ |
| Frontend — build produkcyjny 3 aplikacji | `npm run build` | ✔ (panel: 85 kB gzip initial) |
| `npm audit --omit=dev --audit-level=high` | | 0 podatności |
| Ręczny przepływ E2E w Chromium (Playwright, skrypt poza repo) na pełnym stosie lokalnym | rejestracja → e-mail (Mailpit) → weryfikacja → logowanie → sklep → dane firmy (walidacja NIP) → zaproszenie → MFA (QR) → panel admina → blokada sprzedawcy w panelu admina | ✔ |

Testy E2E w repozytorium (Playwright) — **jeszcze nie ma** (Faza 8).

| Ręczny przepływ E2E Fazy 2 (Playwright, poza repo) | admin konfiguruje i aktywuje operatora (symulator) → sprzedawca na okresie próbnym wybiera Starter → przekierowanie → podpisane powiadomienie → plan aktywny, płatność „Opłacona”; widok mobilny bez poziomego przewijania; strony admina (subskrypcje, plany, kupony, zużycie, MRR) | ✔ |

| Ręczny przepływ E2E Fazy 3 (Playwright, poza repo) | kategorie i marka → produkt z 3 wariantami w edytorze → obniżka z Omnibusem → korekta magazynu i historia → wysyłka i płatności w ustawieniach → zamówienie przez API storefrontu → opłacenie, wysyłka z numerem, notatka → zamówienie ręczne → karta klienta; widoki mobilne bez poziomego przewijania, 0 błędów konsoli | ✔ |

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
- **Faza 3:** checkout działa tylko przez API — interfejs sklepu dla klientów powstaje w Fazie 4. Sklep w stanie „Szkic”
  przyjmuje zamówienia przez API; blokada do czasu publikacji zostanie dodana razem z publikacją sklepu (Faza 4).
- **Faza 3:** brak zdjęć produktów, importu CSV, rabatów, zwrotów/reklamacji i kont klientów (zaplanowane w kolejnych fazach).
- **Faza 3:** VAT od dostawy i opłaty za pobranie liczony stawką 23% (uproszczenie, patrz ADR-015).
- Lokalnie operatora trzeba raz skonfigurować w panelu admina (Rozliczenia → Operatorzy płatności → Symulator, dowolny sekret).
- Panel sprzedawcy nie ma jeszcze modułów produktów, zamówień itd. — nawigacja pokazuje wyłącznie działające sekcje.
- `storefront` to szkielet SSR (bez motywów/katalogu) — Faza 4.
- Dane dev: konto `admin@shopivo.local` / `Platforma!Lokalna-2026` tworzone **tylko** przy profilu `dev` lub zmiennych `SHOPIVO_BOOTSTRAP_*`.
- Regulamin/polityka prywatności — tylko checkbox akceptacji z wersją; treści wymagają prawnika (Q-08).
- Login CSRF: brak tokenu przed logowaniem jest akceptowalny (endpoint wymaga tokenu, który SPA pobiera); pełna
  separacja domen witryn (ADR-012) czeka na decyzję Q-03.
- `X-Forwarded-Host` od klienta musi być nadpisywany przez LB/Cloudflare (inaczej możliwe podanie dowolnego hosta
  sklepu — ujawnia tylko publiczne dane witryn, ale należy to skonfigurować).
- Publikacje zdarzeń, które stale się nie udają (np. błędny adres e-mail), są ponawiane bez limitu — limit prób
  i dead-letter w Fazie 8.
- Obrazy Docker Hub bywały limitowane (429) w środowisku deweloperskim — w CI nie jest to problem.

## Następny krok
**Faza 4 — storefront i motywy**: publiczne strony sklepu (SSR) korzystające z gotowego API koszyka i checkoutu, katalog dla klientów, zdjęcia produktów (pliki), konta klientów, publikacja sklepu. Przed produkcją nadal: Q-06 (faktury/KSeF), test adapterów na sandboxach operatorów, cennik (Q-05).

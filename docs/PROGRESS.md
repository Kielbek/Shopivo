# Shopivo — postęp prac

Ostatnia aktualizacja: 2026-11-25 · Ukończone: **Faza 0**, **Faza 1** (z ograniczeniami opisanymi niżej).

## Wyniki testów (rzeczywiście uruchomione)

| Zestaw | Polecenie | Wynik |
|---|---|---|
| Backend — testy jednostkowe (surefire) | `cd backend && ./mvnw verify` | 15/15 ✔ |
| Backend — testy integracyjne (failsafe, Testcontainers PostgreSQL 17 + Redis 7) | jw. | 30/30 ✔ |
| Frontend — Vitest (3 aplikacje) | `cd frontend && npm test` | 14/14 ✔ |
| Frontend — build produkcyjny 3 aplikacji | `npm run build` | ✔ (panel: 85 kB gzip initial) |
| `npm audit --omit=dev --audit-level=high` | | 0 podatności |
| Ręczny przepływ E2E w Chromium (Playwright, skrypt poza repo) na pełnym stosie lokalnym | rejestracja → e-mail (Mailpit) → weryfikacja → logowanie → sklep → dane firmy (walidacja NIP) → zaproszenie → MFA (QR) → panel admina → blokada sprzedawcy w panelu admina | ✔ |

Testy E2E w repozytorium (Playwright) — **jeszcze nie ma** (Faza 8).

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

## Znane ograniczenia / dług do spłacenia
- Sesja jest odczytywana z bazy przy każdym żądaniu (2 zapytania po kluczu głównym) — cache Redis zaplanowany na Fazę 8.
- Walidacja Bean Validation wykonuje się przed `@PreAuthorize` (członkostwo jest już zweryfikowane filtrem, więc nie ujawnia danych innych sklepów).
- Limit liczby członków zespołu wg planu — dopiero z modułem uprawnień planów (Faza 2).
- Panel sprzedawcy nie ma jeszcze modułów produktów, zamówień itd. — nawigacja pokazuje wyłącznie działające sekcje.
- `storefront` to szkielet SSR (bez motywów/katalogu) — Faza 4.
- Dane dev: konto `admin@shopivo.local` / `Platforma!Lokalna-2026` tworzone **tylko** przy profilu `dev` lub zmiennych `SHOPIVO_BOOTSTRAP_*`.
- Regulamin/polityka prywatności — tylko checkbox akceptacji z wersją; treści wymagają prawnika (Q-08).
- Obrazy Docker Hub bywały limitowane (429) w środowisku deweloperskim — w CI nie jest to problem.

## Następny krok
**Faza 2 — rozliczenia SaaS** (plany, uprawnienia, adapter operatora, webhooki). Wymaga decyzji Q-02 (Stripe Billing vs. operator PL) i Q-05 (cennik) — patrz `PROJECT_SPECIFICATION.md` §8.

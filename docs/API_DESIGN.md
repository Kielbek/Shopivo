# Shopivo — projekt API

## 1. Zasady ogólne
- REST/JSON, prefiks wersji `/api/v1`. Dokumentacja OpenAPI generowana z kodu (springdoc):
  `/api/docs` (JSON), `/api/swagger-ui` (tylko profile nieprodukcyjne lub za uwierzytelnieniem admina).
- Nazwy pól `camelCase`, daty ISO-8601 UTC, kwoty jako obiekt `{ "amount": 12999, "currency": "PLN" }` (grosze).
- Identyfikatory UUID. `tenant_id` **nigdy** nie jest przyjmowany w body.
- Paginacja: `?page=0&size=20&sort=createdAt,desc` → `{ items, page, size, totalItems, totalPages }`;
  maks. `size=100`. Keyset (`?cursor=`) dla bardzo dużych zbiorów.
- Idempotencja operacji tworzących płatności/zamówienia: nagłówek `Idempotency-Key`.
- Współbieżność: `version` w DTO edycji → 409 przy konflikcie.

## 2. Błędy — RFC 9457 (Problem Details)
```json
{
  "type": "https://docs.shopivo.pl/errors/validation",
  "title": "Nieprawidłowe dane",
  "status": 400,
  "detail": "Formularz zawiera błędy.",
  "code": "VALIDATION_FAILED",
  "errors": [{ "field": "email", "code": "Email", "message": "Nieprawidłowy adres e-mail" }],
  "traceId": "…"
}
```
Kody: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`, `403 ACCESS_DENIED`, `404 NOT_FOUND`
(także dla zasobów innej dzierżawy), `409 CONFLICT`, `422 BUSINESS_RULE_VIOLATION`,
`402 ENTITLEMENT_REQUIRED` (limit planu), `429 RATE_LIMITED`, `500 INTERNAL_ERROR` (bez szczegółów).
`code` jest stabilny i służy frontendowi do tłumaczeń.

## 3. Uwierzytelnianie
- Ciasteczko sesji `__Host-shopivo_session` (lokalnie bez prefiksu `__Host-`, bo brak HTTPS) + CSRF
  (`XSRF-TOKEN` ciasteczko → nagłówek `X-XSRF-TOKEN`) dla metod modyfikujących.
- `GET /api/v1/auth/csrf` inicjalizuje token CSRF.

## 4. Katalog endpointów — Faza 1 (zaimplementowane)

### Uwierzytelnianie `/api/v1/auth`
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/csrf` | Ustawia ciasteczko CSRF |
| POST | `/register` | Rejestracja (e-mail, hasło, imię, nazwisko, zgody) → 201, wysyła e-mail weryfikacyjny |
| POST | `/verify-email` | `{token}` → aktywacja konta |
| POST | `/verify-email/resend` | `{email}` → zawsze 202 (bez enumeracji kont) |
| POST | `/login` | `{email, password, rememberMe}` → 200 `{ mfaRequired }` + ciasteczko |
| POST | `/login/mfa` | `{code}` (TOTP lub kod zapasowy) → podniesienie sesji |
| POST | `/logout` | Unieważnia bieżącą sesję |
| POST | `/password/forgot` | `{email}` → zawsze 202 |
| POST | `/password/reset` | `{token, newPassword}` → unieważnia wszystkie sesje |
| GET | `/me` | Bieżący użytkownik + członkostwa |
| GET | `/oauth2/authorization/google` | Start logowania Google (aktywny tylko z konfiguracją) |

### Konto `/api/v1/account`
| Metoda | Ścieżka | Opis |
|---|---|---|
| PATCH | `/profile` | Imię, nazwisko, język |
| POST | `/password` | Zmiana hasła (wymaga bieżącego) |
| GET | `/sessions` | Aktywne sesje |
| DELETE | `/sessions/{id}` | Unieważnienie sesji |
| DELETE | `/sessions` | Wyloguj wszystkie inne |
| POST | `/mfa/totp/setup` | Generuje sekret + URI `otpauth://` |
| POST | `/mfa/totp/confirm` | `{code}` → włącza MFA, zwraca jednorazowo kody zapasowe |
| POST | `/mfa/disable` | `{password, code}` |

### Sklepy (dzierżawy) użytkownika `/api/v1/stores`
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/` | Sklepy, których użytkownik jest członkiem |
| POST | `/` | Utworzenie sklepu `{name, slug}` → dzierżawa + sklep + subdomena + członkostwo OWNER |
| GET | `/slug-availability?slug=` | Sprawdzenie dostępności subdomeny |

### Zakres dzierżawy `/api/v1/tenants/{tenantId}`
| Metoda | Ścieżka | Uprawnienie | Opis |
|---|---|---|---|
| GET | `/store` | `STORE_READ` | Dane sklepu |
| PATCH | `/store` | `STORE_SETTINGS_WRITE` | Nazwa, kontakt, język, waluta, strefa |
| GET/PUT | `/store/settings` | `STORE_READ` / `STORE_SETTINGS_WRITE` | Dane firmy, adres, NIP |
| GET | `/members` | `TEAM_READ` | Zespół |
| PATCH | `/members/{membershipId}` | `TEAM_MANAGE` | Zmiana roli / wyłączenie |
| DELETE | `/members/{membershipId}` | `TEAM_MANAGE` | Usunięcie z zespołu |
| GET/POST | `/invitations` | `TEAM_MANAGE` | Zaproszenia |
| DELETE | `/invitations/{id}` | `TEAM_MANAGE` | Cofnięcie zaproszenia |
| GET | `/audit-logs` | `AUDIT_READ` | Dziennik zdarzeń sklepu |

`POST /api/v1/invitations/accept` `{token}` — akceptacja zaproszenia przez zalogowanego użytkownika.

### Administracja `/api/v1/admin` (role platformowe)
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/overview` | Liczniki: użytkownicy, sklepy (aktywne/zawieszone), nowe w 30 dni |
| GET | `/tenants` | Lista sklepów (wyszukiwanie, filtr statusu) |
| GET | `/tenants/{id}` | Szczegóły |
| POST | `/tenants/{id}/suspend` | `{reason}` — zawieszenie (tylko `PLATFORM_ADMIN`) |
| POST | `/tenants/{id}/reactivate` | Przywrócenie |
| GET | `/users` | Lista użytkowników |
| POST | `/users/{id}/suspend`, `/reactivate` | Blokada konta (unieważnia sesje) |
| GET | `/audit-logs` | Dziennik platformy |

## 5. Kolejne fazy (zarys)
- `/api/v1/tenants/{tenantId}/products|categories|inventory|orders|customers|discounts|…` (Faza 3)
- `/api/v1/storefront/store|catalog|products/{slug}|cart|checkout|account|sitemap.xml` (Fazy 3–4)
- `/api/v1/tenants/{tenantId}/subscription`, `/api/v1/admin/plans` (Faza 2)
- `/api/v1/webhooks/billing/{provider}`, `/api/v1/webhooks/payments/{provider}/{tenantId}`,
  `/api/v1/webhooks/shipping/{provider}/{tenantId}` (Fazy 2, 5)

## 6. Limity zapytań
Redis, okno stałe per klucz:
| Zakres | Klucz | Limit |
|---|---|---|
| Logowanie | IP | 20/min |
| Logowanie | e-mail | 10/15 min, potem blokada konta 15 min (rosnąca) |
| Rejestracja, reset hasła, ponowna weryfikacja | IP | 5/min |
| API panelu | użytkownik | 300/min |
| Storefront API | IP + host | 600/min |

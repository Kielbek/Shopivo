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
`402 ENTITLEMENT_LIMIT` / `402 FEATURE_NOT_IN_PLAN` (limit planu, pole `entitlement`), `402 SUBSCRIPTION_INACTIVE` (sklep tylko do odczytu), `429 RATE_LIMITED`, `500 INTERNAL_ERROR` (bez szczegółów).
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
| GET | `/overview?days=30` | Liczniki: użytkownicy, sklepy (aktywne/zawieszone), nowe w okresie (`usersInPeriod`, `storesInPeriod`) |
| GET | `/stats/growth?days=30` | Dzienne rejestracje i nowe sklepy (dni kalendarzowe Europe/Warsaw, uzupełnione zerami) |
| GET | `/tenants` | Lista sklepów (wyszukiwanie, filtr statusu) |
| GET | `/tenants/{id}` | Szczegóły |
| POST | `/tenants/{id}/suspend` | `{reason}` — zawieszenie (tylko `PLATFORM_ADMIN`) |
| POST | `/tenants/{id}/reactivate` | Przywrócenie |
| GET | `/users` | Lista użytkowników |
| POST | `/users/{id}/suspend`, `/reactivate` | Blokada konta (unieważnia sesje) |
| GET | `/audit-logs` | Dziennik platformy |

## 5. Faza 2 — subskrypcje (zaimplementowane)

`GET /api/v1/plans` (publiczne) → `{ plans, entitlements, vatRateBps, currency }` — ceny netto w groszach.

### Subskrypcja sklepu `/api/v1/tenants/{tenantId}/subscription`
Ścieżka pozostaje zapisywalna, gdy sklep jest tylko do odczytu (inaczej nie dałoby się zapłacić).
| Metoda | Ścieżka | Uprawnienie | Opis |
|---|---|---|---|
| GET | `` | `STORE_READ` | Stan, plan, limity, zużycie w miesiącu, nieopłacone płatności, `access` (`FULL`/`READ_ONLY`) |
| POST | `/checkout` | `BILLING_MANAGE` | `{planCode, interval, couponCode?}` → `{charge, paymentUrl}` (null, gdy rabat 100%) |
| POST | `/change` | `BILLING_MANAGE` | `{planCode, interval}` → `{scheduled, payment}` (wyżej: dopłata z proracją; niżej: od końca okresu) |
| POST | `/cancel`, `/resume` | `BILLING_MANAGE` | Rezygnacja z końcem okresu / cofnięcie |
| GET | `/charges` | `BILLING_MANAGE` | Płatności (netto, VAT, brutto) |
| POST | `/charges/{id}/pay` | `BILLING_MANAGE` | Nowy link płatności (limit 10 / 10 min na użytkownika) |
| GET | `/history` | `BILLING_MANAGE` | Historia zdarzeń subskrypcji |

### Powiadomienia operatorów
`POST /api/v1/webhooks/billing/{provider}` (`przelewy24` | `payu` | `tpay` | `fake` — tylko dev/test). Bez sesji i
CSRF; autentyczność = podpis operatora (P24: SHA-384 + obowiązkowe `transaction/verify`; PayU: `OpenPayu-Signature`;
Tpay: `md5sum`). Zła sygnatura → 400; duplikat → 200 bez ponownego przetwarzania; kwota/waluta niezgodna z opłatą →
płatność nie jest zaliczana (zdarzenie `PAYMENT_AMOUNT_MISMATCH`).

### Administracja (odczyt: personel platformy; zmiany: `PLATFORM_ADMIN`)
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET/PUT | `/api/v1/admin/payment-providers[/{id}]` | Konfiguracja operatorów (sekrety nigdy nie są zwracane) |
| POST | `/api/v1/admin/payment-providers/{id}/test`, `/activate` | Test połączenia, wybór operatora dla subskrypcji |
| GET/POST/PUT | `/api/v1/admin/plans[/{id}]` | Plany, ceny (nowa cena = nowy wiersz), limity; `version` → 409 |
| GET/POST | `/api/v1/admin/coupons`, `POST /coupons/{id}/active` | Kupony |
| GET | `/api/v1/admin/billing/stats` | MRR/ARR (netto), liczniki statusów, wpływy 30 dni, zaległości |
| GET | `/api/v1/admin/subscriptions[?status&q]`, `/subscriptions/{tenantId}` | Lista, szczegóły |
| POST | `/api/v1/admin/subscriptions/{tenantId}/extend-trial` | `{days, reason}` |
| PUT/DELETE | `/api/v1/admin/subscriptions/{tenantId}/overrides/{key}` | Wyjątki od limitów `{value, reason, expiresAt?}` |
| GET | `/api/v1/admin/billing/usage?month=RRRR-MM` | Zużycie, przychód, szacowany koszt, marża, fair use |

## 6. Kolejne fazy (zarys)
- `/api/v1/tenants/{tenantId}/products|categories|inventory|orders|customers|discounts|…` (Faza 3)
- `/api/v1/storefront/store|catalog|products/{slug}|cart|checkout|account|sitemap.xml` (Fazy 3–4)
- `/api/v1/webhooks/payments/{provider}/{tenantId}`,
  `/api/v1/webhooks/shipping/{provider}/{tenantId}` (Fazy 2, 5)

## 7. Limity zapytań
Redis, okno stałe per klucz:
| Zakres | Klucz | Limit |
|---|---|---|
| Logowanie | IP | 20/min |
| Logowanie | e-mail | 10/15 min, potem blokada konta 15 min (rosnąca) |
| Rejestracja, reset hasła, ponowna weryfikacja | IP | 5/min |
| API panelu | użytkownik | 300/min |
| Storefront API | IP + host | 600/min |

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

## 6. Faza 3 — katalog i sprzedaż (zaimplementowane)

### Katalog `/api/v1/tenants/{tenantId}` (`PRODUCTS_READ` / `PRODUCTS_WRITE`)
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/products?q&status&categoryId&lowStock&sort&page&size` | Lista (szukanie po nazwie, SKU, EAN; kategoria obejmuje podkategorie) |
| GET | `/products/stats` | Liczniki produktów i stanów |
| GET/POST/PUT/DELETE | `/products[/{id}]` | Produkt z opcjami (≤ 3) i wariantami (≤ 100); `version` → 409; limit planu → 402 |
| POST | `/products/{id}/duplicate`, `/products/bulk` `{ids, action}` | Kopia (szkic), akcje masowe (≤ 200) |
| GET | `/products/export.csv` | CSV (`;`, UTF-8 BOM, ochrona przed formułami) |
| GET/POST/PUT/DELETE | `/categories[/{id}]` | Drzewo (≤ 5 poziomów, bez cykli) |
| GET/POST/DELETE | `/brands[/{id}]` | Marki |
| GET | `/inventory?q&lowStock` | Stany wariantów |
| POST | `/inventory/{variantId}/adjust` `{mode: DELTA|SET, quantity, reason, note}` | Korekta (nie poniżej 0 ani rezerwacji) |
| PUT | `/inventory/{variantId}/threshold` | Próg niskiego stanu |
| GET | `/inventory/{variantId}/movements` | Historia ruchów (autor, powód, odniesienie) |

Warianty zwracają `lowestPrice30dMinor` — najniższą cenę z 30 dni przed bieżącą ceną (Omnibus).

### Sprzedaż `/api/v1/tenants/{tenantId}`
| Metoda | Ścieżka | Uprawnienie | Opis |
|---|---|---|---|
| GET | `/orders?q&status&paymentStatus&customerId`, `/orders/stats`, `/orders/daily?days` | `ORDERS_READ` | Lista, KPI, sprzedaż dzienna |
| GET | `/orders/{id}` | `ORDERS_READ` | Szczegóły z pozycjami i historią |
| POST | `/orders` `{lines, customer}` | `ORDERS_WRITE` | Zamówienie ręczne (ceny i stany z serwera) |
| POST | `/orders/{id}/status` `{status, trackingNumber?, reason?, version}` | `ORDERS_WRITE` | NEW→PROCESSING→SHIPPED→COMPLETED; anulowanie przed wysyłką |
| POST | `/orders/{id}/paid`, `/refunded`, `/notes` | `ORDERS_WRITE` | Płatność, zwrot (po anulowaniu), notatka wewnętrzna |
| GET/POST/PUT/DELETE | `/shipping-methods[/{id}]` | odczyt `ORDERS_READ`, zmiany `STORE_SETTINGS_WRITE` | Sposoby dostawy (cena, próg darmowej) |
| GET/PUT | `/payment-settings` | `STORE_READ` / `STORE_SETTINGS_WRITE` | Przelew (IBAN mod-97), pobranie, termin płatności |
| GET | `/customers?q&marketing&sort`, `/customers/{id}` | `CUSTOMERS_READ` | Klienci |
| PATCH | `/customers/{id}/note` | `CUSTOMERS_WRITE` | Notatka |
| GET | `/customers/marketing-export.csv` | `MARKETING_WRITE` | Tylko osoby ze zgodą |

### Storefront `/api/v1/storefront` (sklep z nagłówka `Host`, bez sesji i CSRF)
| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/cart` | Nowy koszyk → `{token}` (przechowywany wyłącznie skrót) |
| GET | `/cart` · POST `/cart/items` · PATCH `/cart/items/{variantId}` | Nagłówek `X-Cart-Token`; ceny i dostępność zawsze z katalogu |
| GET | `/checkout/options` | Aktywne sposoby dostawy i metody płatności |
| POST | `/checkout` | Nagłówek `X-Cart-Token`; walidacja (e-mail, kod pocztowy, NIP, regulamin), rezerwacja stanów → `{number, orderToken, totalMinor}`; limit 10 / 10 min / IP |
| GET | `/orders/status` | Nagłówek `X-Order-Token` — potwierdzenie dla klienta (z danymi do przelewu) |

Koszyk i checkout działają tylko dla **opublikowanego** sklepu (inaczej 404 `STORE_NOT_PUBLISHED`), chyba że żądanie
ma ważny nagłówek podglądu `X-Store-Preview`.

## 7. Faza 4a — witryna sklepu, motywy, zdjęcia (zaimplementowane)

### Witryna `/api/v1/storefront` (publiczne, sklep z `Host`, cache `public, max-age=30`, `Vary: X-Store-Preview`)
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/store` | Nazwa, status, `open`, opublikowany motyw (lub szkic w podglądzie, wtedy `no-store`), dane sprzedawcy (firma, NIP, adres, e-mail, telefon), drzewo widocznych kategorii |
| GET | `/categories` | Widoczne kategorie (ukryte poddrzewa pominięte) |
| GET | `/products?kategoria&q&sort=NEWEST\|PRICE_ASC\|PRICE_DESC\|NAME&page&size≤48` | Tylko produkty `ACTIVE`; cena najtańszego wariantu, cena przed obniżką i najniższa z 30 dni (Omnibus), `available` |
| GET | `/products/{slug}` | Warianty z `available`/`lowStock` (bez dokładnych stanów), zdjęcia, okruszki |
| GET | `/sitemap.xml`, `/robots.txt` | Adresy z `shopivo.storefront-url-template`; nieopublikowany sklep → `Disallow: /` |

Nagłówek `X-Store-Preview: <token>` (HMAC, ważny 2 h, przypisany do sklepu) pokazuje szkic motywu i nieopublikowany sklep.

### Panel `/api/v1/tenants/{tenantId}`
| Metoda | Ścieżka | Uprawnienie | Opis |
|---|---|---|---|
| GET | `/store/publish-readiness` | `STORE_READ` | `{ready, missing[]}` — dane firmy, NIP, adres, e-mail, aktywny produkt, dostawa, płatność |
| POST | `/store/publish`, `/store/unpublish` | `STORE_SETTINGS_WRITE` | Publikacja (422 `PUBLISH_NOT_READY` z listą braków) / wyłączenie |
| POST | `/store/preview-token` | `THEMES_WRITE` | `{url}` z tokenem podglądu |
| GET/PUT | `/theme` | `STORE_READ` / `THEMES_WRITE` | Stan motywu (szkic, opublikowany, presety, pola); zapis szkicu z `version` (409 przy konflikcie) |
| POST | `/theme/publish` | `THEMES_WRITE` | Publikacja szkicu |
| POST (multipart `file`, `alt`) | `/products/{id}/images` | `PRODUCTS_WRITE` | JPEG/PNG ≤ 10 MB, ≤ 10 zdjęć na produkt, limit miejsca z planu (402) |
| PUT | `/products/{id}/images` | `PRODUCTS_WRITE` | Kolejność i teksty alternatywne |
| DELETE | `/products/{id}/images/{imageId}` | `PRODUCTS_WRITE` | Usunięcie (pliki kasowane po zatwierdzeniu transakcji) |

### Pliki `/api/v1/media/{tenantId}/{imageId}/{w400|w1200}.jpg`
Publiczne, `Cache-Control: max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`.

## 8. Kolejne fazy (zarys)
- `/api/v1/storefront/account|pages|blog|reviews` (Faza 4b)
- `/api/v1/webhooks/payments/{provider}/{tenantId}`,
  `/api/v1/webhooks/shipping/{provider}/{tenantId}` (Fazy 2, 5)

## 9. Limity zapytań
Redis, okno stałe per klucz:
| Zakres | Klucz | Limit |
|---|---|---|
| Logowanie | IP | 20/min |
| Logowanie | e-mail | 10/15 min, potem blokada konta 15 min (rosnąca) |
| Rejestracja, reset hasła, ponowna weryfikacja | IP | 5/min |
| API panelu | użytkownik | 300/min |
| Storefront API | IP | 600/min (wszystkie żądania sklepu) |
| Utworzenie koszyka | IP | 30/min |
| Checkout | IP | 10 / 10 min |
| Płatność za subskrypcję | użytkownik | 10 / 10 min |

Rozmiar ciała żądania: maks. 1 MB dla `/api/**`, 11 MB dla uploadu zdjęć produktu, 64 KB dla webhooków (413 `PAYLOAD_TOO_LARGE`).
Sklep z wygasłą subskrypcją (tylko do odczytu) może nadal: opłacić subskrypcję (`/subscription/**`) i obsługiwać
złożone zamówienia (`/orders/{id}/status|paid|refunded|notes`); pozostałe zapisy → 402 `SUBSCRIPTION_INACTIVE`.

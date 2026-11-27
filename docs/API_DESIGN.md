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

## 8. Faza 4b — strony, blog, przekierowania (zaimplementowane)

### Panel `/api/v1/tenants/{tenantId}`
| Metoda | Ścieżka | Uprawnienie | Opis |
|---|---|---|---|
| GET | `/content?kind=PAGE\|POST&q&page&size` | `STORE_READ` | Lista stron lub wpisów |
| GET | `/content/legal` | `STORE_READ` | Stan dokumentów prawnych (regulamin, polityka prywatności, zwroty, dostawa) |
| POST | `/content/legal/{TERMS\|PRIVACY\|RETURNS\|SHIPPING}` | `CONTENT_WRITE` | Utworzenie dokumentu ze wzoru (szkic, dane firmy wstawione; 409 gdy istnieje) |
| GET/POST/PUT/DELETE | `/content[/{id}]` | odczyt `STORE_READ`, zmiany `CONTENT_WRITE` | `status: PUBLISHED` publikuje i tworzy wersję (gdy tekst się zmienił); `version` → 409; regulaminu/polityki nie można wycofać ani usunąć w opublikowanym sklepie (422 `LEGAL_PAGE_REQUIRED`) |
| GET | `/content/revisions/{id}` | `ORDERS_READ` lub `CONTENT_WRITE` | Tekst opublikowanej wersji (np. regulamin zaakceptowany przy zamówieniu — `termsRevisionId` w zamówieniu) |
| GET/POST/DELETE | `/redirects[/{id}]` | odczyt `STORE_READ`, zmiany `SEO_WRITE` | Przekierowania 301 (tylko ścieżki w sklepie; pełny URL skracany do ścieżki) |

### Witryna `/api/v1/storefront`
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/pages/{slug}`, `/posts/{slug}` | Opublikowane (szkic tylko z `X-Store-Preview`) |
| GET | `/posts?page&size≤48` | Lista wpisów |
| GET | `/redirect?path=` | Cel przekierowania (`{location}`) lub 404 — wywoływane przez serwer SSR tylko po 404 |

`/store` zwraca też `footerLinks` (dokumenty prawne + strony oznaczone do stopki) i `blog`; sitemap obejmuje strony i wpisy.

## 9. Faza 4c — opinie o produktach (zaimplementowane)

| Metoda | Ścieżka | Uprawnienie | Opis |
|---|---|---|---|
| GET | `/api/v1/tenants/{t}/reviews?status&page&size` | `PRODUCTS_READ` | Opinie (z nazwą produktu i numerem zamówienia) |
| GET | `/api/v1/tenants/{t}/reviews/pending-count` | `PRODUCTS_READ` | Liczba opinii do moderacji |
| POST | `/api/v1/tenants/{t}/reviews/{id}/moderation` | `CONTENT_WRITE` | `{status: APPROVED\|REJECTED}` |
| PUT | `/api/v1/tenants/{t}/reviews/{id}/reply` | `CONTENT_WRITE` | Publiczna odpowiedź sklepu (`null` usuwa) |
| GET | `/api/v1/storefront/products/{slug}/reviews?page` | publiczne | `{summary: {average, count, distribution}, reviews}` — tylko zatwierdzone |
| GET | `/api/v1/storefront/review-invitation` | nagłówek `X-Review-Token` | Produkty zamówienia z zaproszenia; 404 zły token, 410 wygasły (90 dni); 60/10 min/IP |
| POST | `/api/v1/storefront/reviews` | nagłówek `X-Review-Token` | `{productId, rating 1–5, body ≤ 2000, authorName ≤ 60}`; tylko produkty z zamówienia, jedna opinia na produkt w zamówieniu (409); 20/10 min/IP |

Zaproszenie (jednorazowy token we fragmencie adresu `#t=`, w bazie skrót) wysyłane e-mailem po zmianie statusu zamówienia ze sklepu na „Zrealizowane”;
sklep dostaje e-mail o opinii do moderacji.

**Weryfikacja zakupu** (oba sposoby wystawienia opinii): zamówienie zrealizowane (`COMPLETED`) i opłacone (`PAID`) lub
za pobraniem (`COD`), nigdy zwrócone (`REFUNDED`); produkt musi być pozycją tego zamówienia; jedna opinia na produkt w
zamówieniu (unikalny indeks).

## 10. Faza 4d — konta klientów (zaimplementowane)

`/api/v1/storefront/account/**` — sklep z nagłówka `Host` (tylko opublikowany), **każde** żądanie z nagłówkiem
`X-Requested-With: shopivo` (inaczej 403 `MISSING_HEADER` — ochrona CSRF), sesja w ciasteczku `shopivo_customer`
(HttpOnly, SameSite=Lax, bez atrybutu Domain — tylko domena tego sklepu, `Secure` w produkcji, 30 dni). Odpowiedzi `no-store`.

| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/register` | `{email, password, firstName, lastName, termsAccepted}` → zawsze 202 (nie ujawnia, czy konto istnieje); e-mail z linkiem lub „masz już konto”; 10/10 min/IP, 3/h/e-mail |
| POST | `/verify` | `{token, password}` — link z e-maila **i** hasło z tej rejestracji → ciasteczko sesji (ochrona przed przejęciem konta zarejestrowanego na cudzy e-mail) |
| POST | `/login`, `/logout` | Logowanie tylko po potwierdzeniu e-maila; jednakowa odpowiedź dla nieznanego e-maila i złego hasła; 10 prób / 15 min na adres e-mail w sklepie (jednakowo dla istniejących i nieistniejących), 30/10 min/IP |
| POST | `/password-reset`, `/password-reset/confirm` | Zawsze 202; link jednorazowy ważny 1 h; po zmianie hasła wszystkie sesje kończą się |
| GET/PATCH | `/me` | Dane konta (GET dla gościa → 204) |
| POST | `/password`, `/delete` | Zmiana hasła (inne sesje wylogowane), usunięcie konta (wymaga hasła; zamówienia zostają w sklepie) |
| GET/POST/PUT/DELETE | `/addresses[/{id}]` | Do 10 adresów, domyślny |
| GET | `/orders`, `/orders/{number}` | Zamówienia złożone na potwierdzony e-mail konta (bez notatek wewnętrznych); cudze → 404 |
| GET | `/reviews/pending` | Produkty z własnych zweryfikowanych zakupów bez opinii |
| POST | `/reviews` | `{orderNumber, productId, rating, body}` — tylko z własnego zamówienia spełniającego weryfikację zakupu |

## 11. Faza 4e — CAPTCHA i menu (zaimplementowane)

- **CAPTCHA** (Cloudflare Turnstile): `POST /storefront/checkout`, `/account/register`, `/account/password-reset` wymagają
  nagłówka `X-Captcha-Token` (400 `CAPTCHA_FAILED`). Klucz witryny w `/storefront/store` → `captchaSiteKey`
  (`null` = wyłączona: tylko lokalnie/testy). Niedostępność Cloudflare nie blokuje zamówień (log ostrzegawczy; limity na IP nadal działają).
- **Menu**: `GET /tenants/{t}/navigation` (`STORE_READ`), `PUT` (`CONTENT_WRITE`, `{items: [{label ≤ 40, path}], version}`;
  do 12 pozycji, tylko ścieżki w sklepie, 409 przy konflikcie; pusta lista = domyślne kategorie); w witrynie `/store` → `menu`.
- **Klienci**: `accountCreatedAt` w `/customers` i `/customers/{id}` — data założenia potwierdzonego konta w sklepie.

## 12. Faza 5a — płatności online sklepów (zaimplementowane)

| Metoda | Ścieżka | Uprawnienie / autoryzacja | Opis |
|---|---|---|---|
| GET | `/tenants/{t}/online-payments` | `STORE_READ` | Dostępni operatorzy (pola danych), stan konta sklepu — **bez wartości sekretów** (`filled`: które pola są ustawione) |
| PUT | `/tenants/{t}/online-payments` | `STORE_SETTINGS_WRITE` | `{providerId, credentials, sandbox, version}`; puste pola = bez zmian; każda zmiana wyłącza płatności do ponownego testu |
| POST | `/tenants/{t}/online-payments/test`, `/enabled` | `STORE_SETTINGS_WRITE` | Test połączenia u operatora; włączenie tylko po udanym teście |
| POST | `/storefront/orders/pay` | nagłówek `X-Order-Token` | Start/ponowienie płatności nieopłaconego zamówienia ONLINE → `{redirectUrl}` (tylko `https://`); 20/10 min/IP |
| POST | `/storefront/account/orders/{number}/pay` | sesja klienta | To samo dla własnego zamówienia z konta |
| POST | `/webhooks/store-payments/{tenantId}/{provider}` | podpis operatora kluczem sklepu | Powiadomienie: weryfikacja podpisu, zgodność kwoty i waluty z próbą płatności, idempotencja (`store_payment_events`), wpłata po anulowaniu → zdarzenie do zwrotu; 400 przy złym podpisie, 404 gdy sklep nie ma tego operatora |

Metoda `ONLINE` w `/storefront/checkout/options` (gdy włączona); nieopłacone zamówienia ONLINE anulowane po 24 h.

## 13. Faza 5b — wysyłka (zaimplementowane)

| Metoda | Ścieżka | Uprawnienie / autoryzacja | Opis |
|---|---|---|---|
| GET | `/tenants/{t}/carriers` | `STORE_READ` | Dostępni przewoźnicy (pola danych, obsługiwane rodzaje dostawy) i konta sklepu — **bez wartości sekretów** (`filled`) |
| PUT | `/tenants/{t}/carriers/{carrier}` | `STORE_SETTINGS_WRITE` | `{credentials, sandbox, version}`; puste pola = bez zmian; zmiana wyłącza konto do ponownego testu |
| POST | `/tenants/{t}/carriers/{carrier}/test`, `/enabled` | `STORE_SETTINGS_WRITE` | Test połączenia; włączenie tylko po udanym teście |
| GET | `/tenants/{t}/orders/{id}/shipments` | `ORDERS_READ` | Przesyłki zamówienia (status, numer, link śledzenia, błąd) |
| POST | `/tenants/{t}/orders/{id}/shipments` | `ORDERS_WRITE` | `{template \| weightGrams+wymiary, sendingMethod}` → 201; jedna aktywna przesyłka na zamówienie (409 `SHIPMENT_EXISTS`), `INVALID_PARCEL`, `SHIPMENT_FAILED` z komunikatem przewoźnika; pobranie = kwota nieopłaconego zamówienia COD |
| POST | `/tenants/{t}/shipments/{id}/refresh` | `ORDERS_WRITE` | Stan u przewoźnika (numer przesyłki, status; doręczenie → zamówienie zrealizowane) |
| GET | `/tenants/{t}/shipments/{id}/label` | `ORDERS_READ` | Etykieta PDF (`application/pdf`, sprawdzany nagłówek `%PDF-`) |
| GET | `/storefront/pickup-points?metoda={shippingMethodId}&q=` | publiczne (host sklepu) | Paczkomaty przewoźnika powiązanego z metodą (kod pocztowy / miasto / kod punktu), cache |

`/storefront/checkout/options`: metoda ma `carrier` i `requiresPickupPoint`; `CheckoutInput.pickupPointCode` jest wymagany
dla takiej metody (`PICKUP_POINT_REQUIRED`) i sprawdzany u przewoźnika. `ShippingInput.carrier` w panelu
(`CARRIER_NOT_CONNECTED`, `CARRIER_UNSUPPORTED`). Śledzenie: zadanie co 30 min (ShedLock).

## 13a. Branża sklepu (zaimplementowane)

| Metoda | Ścieżka | Uprawnienie | Opis |
|---|---|---|---|
| POST | `/stores` | zalogowany | opcjonalne pole `industry` (np. `FASHION`); nieznany kod → 400 |
| PUT | `/tenants/{t}/store/industry` | `STORE_SETTINGS_WRITE` | `{industry}` lub `{industry: null}`; widok sklepu (`GET /tenants/{t}/store`) zwraca `industry` |

## 13b. Dokumenty prawne — dane i podgląd (zaimplementowane)

| Metoda | Ścieżka | Uprawnienie | Opis |
|---|---|---|---|
| GET | `/tenants/{t}/content/legal` | `STORE_READ` | Status dokumentów + `missing`: lista znaczników „[uzupełnij: …]” pozostałych w treści |
| GET / PUT | `/tenants/{t}/content/legal/settings` | `STORE_READ` / `CONTENT_WRITE` | Termin wysyłki, data obowiązywania regulaminu, adres zwrotów, narzędzia analityczne i reklamowe; `version` -1 = pierwszy zapis; 409 przy nieaktualnej wersji, 422 przy nawiasach kwadratowych lub dacie spoza zakresu |
| GET | `/tenants/{t}/content/legal/{key}/template` | `STORE_READ` | Wzór wypełniony aktualnymi danymi + `missing` (podgląd przed utworzeniem, odświeżenie treści) |

Odświeżenie dokumentu ze wzoru to zwykły `PUT /content/{id}` z treścią wzoru (opublikowany dokument publikuje nową
rewizję; zamówienia wskazują rewizję zaakceptowaną przez klienta). Podgląd w panelu to prawdziwa strona sklepu w
`<iframe>` z linkiem podglądu; witryna pozwala na osadzenie tylko odpowiedziom `?podglad=` i tylko z adresów
`SHOPIVO_PANEL_ORIGIN`.

## 13c. Sekcje motywu, obrazy i newsletter (zaimplementowane)

| Metoda | Ścieżka | Uprawnienie | Opis |
|---|---|---|---|
| GET/PUT | `/tenants/{t}/theme` | `STORE_READ` / `THEMES_WRITE` | Odpowiedź ma `sectionTypes` (schemat 10 typów sekcji); szkic przyjmuje `sections` (maks. 20; id `[a-z0-9]{4,24}`, nieznane pola → 422, linki tylko względne `/…` lub `https://`). `sections: null` = migracja starych pól banera do sekcji |
| GET / POST | `/tenants/{t}/theme/images` | `STORE_READ` / `THEMES_WRITE` | Biblioteka zdjęć motywu (JPEG/PNG ≤ 10 MB, maks. 40) |
| DELETE | `/tenants/{t}/theme/images/{id}` | `THEMES_WRITE` | |
| POST / DELETE | `/tenants/{t}/categories/{id}/image` | `PRODUCTS_WRITE` | Zdjęcie kategorii (jedno; nowe zastępuje poprzednie) |
| GET | `/tenants/{t}/newsletter?status=&q=&page=` | `CUSTOMERS_READ` | Lista subskrybentów |
| GET | `/tenants/{t}/newsletter/summary` | `CUSTOMERS_READ` | Liczby wg statusu |
| GET | `/tenants/{t}/newsletter/export.csv` | `MARKETING_WRITE` | Tylko potwierdzeni; ochrona przed formułami w CSV; zapis w audycie |
| DELETE | `/tenants/{t}/newsletter/{id}` | `CUSTOMERS_WRITE` | Trwałe usunięcie (np. żądanie RODO) |
| POST | `/storefront/newsletter` | publiczne, `X-Requested-With: shopivo` | Zapis → zawsze 202 (nie ujawnia, czy adres jest na liście); e-mail z potwierdzeniem; limity na IP i adres |
| POST | `/storefront/newsletter/confirm`, `/unsubscribe` | jw. | `{token}` z linku (token w `#fragmencie`, nie trafia do logów serwera) |
| GET | `/storefront/reviews/latest` | publiczne | Ostatnie zatwierdzone opinie (sekcja „Opinie”) |

`/storefront/store` zwraca `themeImages` (id → adresy wariantów) i — tylko w podglądzie — `panelOrigin`: z tego adresu
witryna przyjmuje wiadomości `postMessage` edytora (`shopivo:theme`) i tylko od `window.parent`; kształt jest
walidowany, a adresy zdjęć muszą zaczynać się od `/api/v1/media/`. `/storefront/products?promocje=true` — produkty w promocji.

## 14. Kolejne fazy (zarys)
- Faza 5c: DPD; zwroty płatności przez API operatorów
- `/api/v1/webhooks/payments/{provider}/{tenantId}`,
  `/api/v1/webhooks/shipping/{provider}/{tenantId}` (Fazy 2, 5)

## 15. Limity zapytań
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

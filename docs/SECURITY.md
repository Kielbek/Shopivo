# Shopivo — bezpieczeństwo i zgodność

## 1. Model zagrożeń (skrót, STRIDE)

| Zagrożenie | Przykład | Kontrola |
|---|---|---|
| Dostęp do danych innego sklepu | podmiana `tenantId`/`productId` w URL | członkostwo weryfikowane serwerowo, `@TenantId`, RLS, 404 zamiast 403, testy izolacji |
| Przejęcie konta | credential stuffing, zgadywanie kodów MFA | limity Redis (IP, e-mail, sesja **i konto** dla MFA), trwała blokada konta, MFA TOTP, powiadomienie o logowaniu (Faza 8) |
| Przejęcie roli admina | wcześniejsza rejestracja na e-mail bootstrapu | bootstrap nie podnosi uprawnień kontu z niezweryfikowanym e-mailem; uprawnienia platformowe tylko przy włączonym MFA |
| DoS routingu domen | zalew losowymi nagłówkami `Host` | walidacja nazwy hosta, ograniczony cache (Caffeine 20k, 30 s), limit per IP (nie per host) |
| Kradzież sesji | XSS → token | ciasteczko HttpOnly, CSP, brak tokenów w `localStorage` |
| CSRF | formularz na obcej stronie lub witrynie sklepu (ten sam „site”) | `SameSite=Lax`, ciasteczko `__Host-XSRF-TOKEN` (odporne na cookie tossing), token tylko z nagłówka, brak CORS, ADR-012 |
| Fałszywe webhooki | sfałszowane „opłacone” | weryfikacja podpisu, idempotencja, potwierdzenie statusu przez API operatora |
| Wyciek sekretów | klucze operatorów w bazie | AES-256-GCM, klucz poza bazą, rotacja wersji klucza |
| Złośliwe pliki | SVG z JS, polyglot | weryfikacja sygnatur, re-enkodowanie obrazów, zakaz SVG od sprzedawców (lub sanityzacja), osobna domena CDN |
| Wstrzyknięcia | SQL, HTML w opisach produktów | JPA/parametry, sanityzacja HTML (OWASP Java HTML Sanitizer) z białą listą, Angular auto-escaping |
| Nadużycie zasobów | masowe tworzenie sklepów | limity, weryfikacja e-mail przed publikacją sklepu, CAPTCHA (Faza 8) |
| Eskalacja uprawnień | MANAGER nadaje sobie OWNER | macierz uprawnień, OWNER nie może być nadany przez nie-OWNER, ostatni OWNER nieusuwalny |

## 2. Uwierzytelnianie
- Hasła: `DelegatingPasswordEncoder` z domyślnym **Argon2id** (parametry OWASP: m=19 MiB, t=2, p=1);
  minimalna długość 10, maks. 128, sprawdzanie popularnych haseł (lista top-10k) — Faza 8: HIBP k-anonymity.
- Sesje: patrz ADR-004. Idle timeout 7 dni dla „zapamiętaj mnie”, 12 h bez; absolutny limit 30 dni.
  `last_seen_at` aktualizowany maks. raz na 5 min (redukcja zapisów).
- Zmiana hasła / reset / blokada konta → unieważnienie wszystkich sesji (poza bieżącą przy zmianie hasła).
- MFA: TOTP (RFC 6238, 30 s, 6 cyfr, okno ±1), sekret szyfrowany, 10 kodów zapasowych (hash).
  Sesja po haśle ma stan `mfa_verified=false` i dostęp wyłącznie do `/auth/login/mfa`, `/auth/logout`, `/auth/me`.
- Tokeny jednorazowe (weryfikacja, reset, zaproszenia): 256-bit losowe, w bazie SHA-256, ważność 24 h / 1 h / 7 dni,
  jednorazowe.
- Brak enumeracji kont: identyczne odpowiedzi dla istniejących/nieistniejących e-maili (forgot, resend);
  rejestracja istniejącego e-maila → ta sama odpowiedź 201 + e-mail informacyjny do właściciela konta.
- Google OAuth2: tylko zweryfikowane e-maile Google; łączenie z istniejącym kontem wyłącznie gdy e-mail
  konta jest zweryfikowany.

## 3. Autoryzacja — macierz uprawnień w sklepie

| Uprawnienie | OWNER | ADMIN | MANAGER | PRODUCT_MANAGER | ORDER_MANAGER | CUSTOMER_SUPPORT |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| STORE_READ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| STORE_SETTINGS_WRITE | ✔ | ✔ | ✔ | | | |
| TEAM_READ | ✔ | ✔ | ✔ | | | |
| TEAM_MANAGE | ✔ | ✔ | | | | |
| BILLING_MANAGE | ✔ | | | | | |
| STORE_DELETE | ✔ | | | | | |
| PRODUCTS_READ / WRITE | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✔ | ✔/ | ✔/ |
| ORDERS_READ / WRITE | ✔/✔ | ✔/✔ | ✔/✔ | | ✔/✔ | ✔/ |
| CUSTOMERS_READ / WRITE | ✔/✔ | ✔/✔ | ✔/✔ | | ✔/ | ✔/✔ |
| THEMES_WRITE, CONTENT_WRITE, SEO_WRITE | ✔ | ✔ | ✔ | ✔ (SEO, treści) | | |
| INTEGRATIONS_MANAGE, DOMAINS_MANAGE | ✔ | ✔ | | | | |
| AUDIT_READ | ✔ | ✔ | | | | |

Implementacja: `StorePermission` + `StoreRole.permissions()`; sprawdzanie `@PreAuthorize("@tenantAccess.can('X')")`.
Reguły dodatkowe: tylko OWNER nadaje/odbiera rolę OWNER; dzierżawa musi mieć ≥ 1 aktywnego OWNER-a.

Role platformowe: `PLATFORM_ADMIN`, `PLATFORM_SUPPORT`. Panel admina na osobnej domenie. **Uprawnienia
platformowe są przyznawane tylko kontom z włączonym MFA** (`SHOPIVO_REQUIRE_STAFF_MFA=true`, domyślnie; wyłączone
wyłącznie w profilu `dev`). Lista dozwolonych IP — Faza 8.

## 4. Ochrona aplikacji webowej
- Panele SPA serwowane przez nginx (`docker/nginx/spa.conf`) z CSP `script-src 'self'` (bez skryptów inline —
  inline'owanie krytycznego CSS wyłączone), HSTS, `frame-ancestors 'none'`, COOP. Zweryfikowane w przeglądarce:
  0 naruszeń CSP w buildzie produkcyjnym.
- Actuator dostępny wyłącznie na porcie zarządzania (reguła po porcie lokalnym); port nie może być publiczny.
- Nagłówki: `Content-Security-Policy` (per aplikacja; storefront z nonce dla skryptów inline SSR),
  `Strict-Transport-Security` (preload po weryfikacji), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'` (panele).
- CORS: wyłączony (ten sam origin przez reverse proxy). Jeśli konieczny — jawna lista originów.
- Walidacja wejścia: Bean Validation na DTO + reguły domenowe w serwisach; limity rozmiaru żądań.
- Błędy: Problem Details bez stack trace, bez nazw tabel; szczegóły tylko w logach z `traceId`.
- Logi: brak haseł, tokenów, pełnych numerów, sekretów; e-maile maskowane w logach aplikacyjnych.

## 5. Sekrety
- Aplikacyjne: wyłącznie zmienne środowiskowe / menedżer sekretów chmury. Brak sekretów w repozytorium
  (CI: gitleaks).
- Poświadczenia sprzedawców: AES-256-GCM, format `v{wersja}:{base64(iv|ciphertext|tag)}`, AAD = `tenant_id`
  (zapobiega przeniesieniu szyfrogramu między dzierżawami). Klucze: `SHOPIVO_ENCRYPTION_KEYS` (wersja→klucz),
  `SHOPIVO_ENCRYPTION_ACTIVE_KEY`. Rotacja: nowe zapisy nowym kluczem, zadanie re-szyfrujące.

## 6. Webhooki
Weryfikacja podpisu (HMAC/podpis operatora) na surowym body przed parsowaniem, tolerancja czasu (replay),
tabela `webhook_events` z unikalnym `(provider, event_id)`, przetwarzanie asynchroniczne z retry,
odpowiedź 2xx dopiero po trwałym zapisie zdarzenia.

## 7. Pliki
Zaimplementowane (Faza 4a): limit 10 MB, typ z sygnatury (JPEG/PNG), wymiary sprawdzane z nagłówka przed dekodowaniem
(≤ 8000 px, ≤ 40 MP), dekodowanie bez metadanych, re-enkodowanie (serwowane są tylko warianty JPEG — bez EXIF/GPS i
payloadów), maks. 2 równoległe dekodowania na instancję (503 przy przeciążeniu), losowe identyfikatory obiektów,
klucze budowane wyłącznie z UUID i stałej listy wariantów, `nosniff`, limit 1200 pobrań/min/IP. Osobna domena CDN —
Faza 6.

## 8. Zależności i CI
Dependabot (Maven, npm, Actions), `npm audit --audit-level=high`, OWASP Dependency-Check / OSV-Scanner,
CodeQL, gitleaks, skan obrazów Docker (Trivy).

## 9. RODO i prawo konsumenckie — wsparcie techniczne

> **Zastrzeżenie:** Poniższe to funkcje techniczne wspierające zgodność. Nie stanowią porady prawnej ani gwarancji
> zgodności. Regulaminy, polityki prywatności, umowy powierzenia (DPA), treści zgód i obowiązków informacyjnych
> **wymagają przeglądu prawnika**.

Role: Shopivo jest **administratorem** danych sprzedawców (użytkowników platformy) oraz **podmiotem
przetwarzającym** dane klientów sklepów (administratorem jest sprzedawca) → wymagana umowa powierzenia (DPA)
akceptowana przy zakładaniu sklepu, rejestr podprocesorów (hosting, e-mail, AI, Cloudflare).

| Wymaganie | Realizacja | Faza |
|---|---|---|
| Rejestr zgód | `customer_consents` (typ, wersja treści, czas, IP, źródło) | 3 |
| Prawo dostępu / przenoszenia | eksport JSON danych klienta / użytkownika | 3 / 8 |
| Prawo do usunięcia | anonimizacja klienta z zachowaniem zamówień wymaganych przepisami podatkowymi (5 lat) | 3 / 8 |
| Baner cookies | storefront: kategorie zgód, blokowanie GA/GTM/Pixel do zgody (Consent Mode v2) | 4 / 7 |
| Prawo odstąpienia 14 dni | moduł zwrotów; treści wzorca formularza — przegląd prawny | 3 |
| Omnibus (najniższa cena z 30 dni) | historia cen `product_price_history`, prezentacja przy promocjach | 3 |
| Retencja | zadania czyszczące: sesje, tokeny, logi audytu (konfigurowalnie, domyślnie 2 lata) | 8 |
| Lokalizacja danych | infrastruktura w UE | 0/6 |

## 10. Stan wdrożenia kontroli
Aktualny stan: `docs/PROGRESS.md`.

## 11. Przegląd Faz 2–3 (2026-11-26) — ustalenia i poprawki

| # | Ustalenie | Ryzyko | Poprawka | Test |
|---|---|---|---|---|
| 1 | Publiczne API (checkout, webhooki) przyjmowało dowolnie duże ciało żądania (Tomcat limituje tylko formularze) | DoS pamięci przez anonimowego klienta | `RequestSizeLimitFilter`: 1 MB, webhooki 64 KB, także dla `chunked` | `ReviewRegressionIT` |
| 2 | Brak limitu żądań API panelu na użytkownika (opisany w dokumentacji, niezaimplementowany) | przeciążenie bazy skryptem z ważną sesją | `UserRateLimitFilter`: 300/min, 429 + `Retry-After` | `ReviewRegressionIT` |
| 3 | Przy sprzedaży „na minusie” (rezerwacje > stan) przyjęcie dostawy było odrzucane | błąd działania magazynu | zwiększenia stanu zawsze dozwolone, zmniejszenia nadal nie poniżej rezerwacji | `BackorderIT` |
| 4 | Wygasła subskrypcja blokowała realizację już złożonych (i opłaconych) zamówień | naruszenie obowiązków wobec konsumentów | w trybie tylko do odczytu dozwolona obsługa istniejących zamówień | `ReviewRegressionIT` |
| 5 | Zmiana waluty sklepu przy istniejących cenach/zamówieniach | kwoty w PLN sprzedawane jako EUR | SPI `CurrencyChangeGuard` (katalog, zamówienia) → 422 `CURRENCY_LOCKED` | `ReviewRegressionIT` |
| 6 | Komunikaty błędów frameworka po angielsku, mogły zawierać fragmenty żądania | spójność, ujawnianie szczegółów | stałe polskie komunikaty dla 400/404/405/413/415 | `ReviewRegressionIT` |
| 7 | Przekierowanie do operatora płatności akceptowało dowolny URL | `javascript:` przy skompromitowanej odpowiedzi | tylko `https:` (lub `http:` tego samego originu — dev) | `format.spec.ts` |
| 8 | Puste koszyki (tanie do utworzenia) czyszczone dopiero po 30 dniach | zaśmiecanie bazy | puste koszyki usuwane po 1 dniu, zadanie co godzinę, indeks `carts_updated_idx` | — |
| 9 | Zadanie anulowania nieopłaconych przelewów skanowało wszystkie zamówienia | wydajność przy skali | indeks częściowy `orders_unpaid_transfer_idx` (V6) | — |
| 10 | Wpłata za anulowaną opłatę subskrypcji (stary link) była cicho zaliczana | podwójna płatność bez śladu | zdarzenie `PAYMENT_ON_VOID_CHARGE` + log ostrzegawczy (do zwrotu przez administratora) | — |
| 11 | Błędna kwota w powiadomieniu Tpay kończyła się błędem 500 | ponawianie śmieciowych powiadomień | odrzucenie jako nieprawidłowe powiadomienie (400) | — |
| 12 | Brak górnych limitów niektórych list wejściowych (kategorie produktu, wartości opcji) | duże zapytania `IN (…)` | limity 50 kategorii / 200 wartości przed dostępem do bazy | — |

Zweryfikowane bez zmian: izolacja dzierżaw w nowych tabelach (RLS + jawny `tenant_id` w zapytaniach JDBC, testy
izolacji w `CatalogIT`/`OrdersIT`), tokeny koszyka i zamówienia (256 bit, w bazie tylko skrót, zawsze w zakresie sklepu
z nagłówka `Host`), ceny i dostępność wyłącznie z katalogu po stronie serwera, atomowe rezerwacje (test współbieżny),
weryfikacja podpisów i kwot powiadomień operatorów, sekrety operatorów szyfrowane i nigdy nie zwracane, ochrona CSV przed
formułami, eksport zgód marketingowych tylko dla osób ze zgodą, `Cache-Control: no-store` na odpowiedziach koszyka
(nagłówki Spring Security).

**Ryzyka zaakceptowane (do kolejnych faz):** checkout gościa może być nadużyty do wysyłania e-maili potwierdzeń na cudze
adresy i blokowania towaru zamówieniami za pobraniem (limit 10 zamówień / 10 min / IP; CAPTCHA/Turnstile planowane w
Fazie 4 razem z interfejsem sklepu); sklep w stanie „Szkic” przyjmuje zamówienia przez API (blokada wraz z publikacją
sklepu w Fazie 4); pamięć podręczna stanu subskrypcji per instancja (do 30 s opóźnienia między replikami).

## 12. Przegląd Fazy 4a (2026-11-26) — ustalenia i poprawki

| # | Ustalenie | Ryzyko | Poprawka | Test |
|---|---|---|---|---|
| 1 | Równoległe uploady sprawdzały limit 10 zdjęć i limit miejsca bez blokady | przekroczenie limitów planu, zduplikowane pozycje | blokada wiersza produktu + blokada doradcza per sklep na czas krótkiej transakcji | `StorefrontIT` (14 równoległych uploadów → dokładnie 10) |
| 2 | Upload równoległy z usunięciem produktu mógł zostawić osierocone pliki (liczone do limitu) | wyciek miejsca, koszty | usuwanie produktu najpierw blokuje wiersz; upload po usunięciu → 404 | `CatalogIT`, `StorefrontIT` |
| 3 | Dekodowanie i zapis do S3 wewnątrz transakcji bazy | wyczerpanie puli połączeń przy wolnym S3/dużych zdjęciach | przetwarzanie i zapis plików przed krótką transakcją; pliki usuwane, gdy transakcja się nie powiedzie | `StorefrontIT` (brak plików po odrzuceniu z limitu) |
| 4 | Brak limitu równoległych dekodowań (do ~320 MB na obraz) | OutOfMemory przy serii uploadów | semafor (domyślnie 2, `shopivo.media.max-concurrent-processing`), 503 `IMAGE_PROCESSING_BUSY` | — |
| 5 | Klient S3 bez limitów czasu | zawieszone wątki przy awarii magazynu | 10 s na próbę, 30 s na wywołanie | — |
| 6 | Publiczne pobieranie zdjęć bez limitu (każdy brak = zapytanie do S3) | koszty/DoS | 1200/min/IP | — |
| 7 | Zapis szkicu motywu: sprawdzenie wersji i zapis w dwóch krokach | utrata zmian przy dwóch edytorach | compare-and-set w jednym zapytaniu (409) | `StorefrontIT` |
| 8 | Dane sprzedawcy (adres, telefon — często prywatne) publiczne przed publikacją sklepu | ujawnienie danych osobowych | zwracane dopiero dla opublikowanego sklepu lub w podglądzie | `StorefrontIT` |
| 9 | Klucz tokenów podglądu z pustej konfiguracji byłby stały | fałszowanie podglądu | brak kluczy → aplikacja nie startuje | — |
| 10 | Token podglądu zostawał w pasku adresu; strony podglądu mogły trafić do cache/indeksu | wyciek linku, indeksowanie szkicu | usuwanie z adresu (`history.replaceState`), `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, `noindex` w meta | ręcznie (curl, E2E) |
| 11 | Wyszukiwarka: brak ucieczki `\` w LIKE i limitu długości frazy | błędne wyniki, kosztowne zapytania | ucieczka `\`, `%`, `_`; fraza ≤ 100 znaków | — |

Zweryfikowane bez zmian: zapytania katalogu publicznego zawsze z `tenant_id` sklepu z nagłówka `Host` (+ RLS), tylko
produkty `ACTIVE` i widoczne kategorie, brak dokładnych stanów magazynowych w API; wartości motywu walidowane na
serwerze (kolory `#RRGGBB`, listy opcji, długości, bez znaków sterujących), w szablonach wyłącznie interpolacja Angulara
(bez `innerHTML`), JSON-LD z ucieczką `<`; token podglądu HMAC przypisany do sklepu i ważny 2 h; upload zdjęcia do
produktu innego sklepu → 404 (test).

Znane, nienaprawione: CSP witryny nie ogranicza jeszcze `script-src` (wymaga nonce dla skryptów wstawianych przez Angular
SSR — Faza 8); serwer SSR akceptuje każdy `Host` (domeny własne) — LB musi przepuszczać tylko domeny platformy i
zweryfikowane domeny własne, a wywołania API z SSR idą wyłącznie na stały adres `SHOPIVO_API_URL` (brak SSRF przez
`Host`); unieważnienie statusu publikacji na innych instancjach do 30 s.

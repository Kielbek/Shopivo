# Shopivo — architektura

## 1. Widok ogólny

```
                    ┌──────────────────────── Cloudflare ────────────────────────┐
  przeglądarka ───► │ DNS (*.shopivo.pl, CNAME domen własnych), CDN, WAF,         │
                    │ Cloudflare for SaaS (SSL domen własnych)                    │
                    └───────┬─────────────────────┬───────────────────────┬───────┘
                            │ app./admin.          │ {sklep}.shopivo.pl     │ cdn.shopivo.pl
                            ▼                      ▼ + domeny własne        ▼
              ┌──────────────────────┐  ┌──────────────────────────┐  ┌───────────────┐
              │ merchant-dashboard / │  │ storefront (Angular SSR, │  │ S3-compatible │
              │ platform-admin       │  │ Node) — jedna instancja  │  │ object storage│
              │ (statyczne SPA)      │  │ obsługuje WSZYSTKIE sklepy│  └───────────────┘
              └─────────┬────────────┘  └────────────┬─────────────┘
                        │ /api/** (ten sam origin)   │ /api/** + X-Forwarded-Host
                        ▼                            ▼
              ┌───────────────────────────────────────────────────┐
              │ backend — Spring Boot modularny monolit (N replik) │
              │ REST /api/v1, webhooki, zadania w tle              │
              └───────┬─────────────────────┬─────────────────────┘
                      ▼                     ▼
            ┌───────────────────┐  ┌──────────────────┐
            │ PostgreSQL (RLS)  │  │ Redis (cache,     │
            │ zarządzany, HA    │  │ limity, blokady)  │
            └───────────────────┘  └──────────────────┘
```

Wszystkie komponenty są bezstanowe poza PostgreSQL/Redis/S3 — skalowanie horyzontalne przez dodanie replik.

## 2. Decyzje architektoniczne (ADR)

### ADR-001: 1 dzierżawa = 1 sklep
Dzierżawa (`tenants`) to jednostka izolacji danych **i** rozliczeń; sklep (`stores`) to konfiguracja witryny.
Relacja startowa 1:1, ale `stores.tenant_id` nie jest kluczem głównym, więc przyszłe „wiele witryn w jednej
subskrypcji” nie wymaga migracji danych handlowych. Użytkownik posiadający 3 sklepy ma 3 członkostwa i 3 subskrypcje
(model jak w Shopify) — proste rozliczanie limitów per sklep.

### ADR-002: Modularny monolit + Spring Modulith
Jeden artefakt Spring Boot, pakiety `pl.shopivo.<moduł>`. Każdy moduł ma publiczne API (pakiet główny modułu:
serwisy-fasady, DTO, zdarzenia) i część wewnętrzną (`internal`). Granice weryfikuje test `ModularityTests`
(Spring Modulith `ApplicationModules.verify()`) — naruszenie granic łamie build.
Komunikacja między modułami: synchronicznie przez publiczne fasady lub asynchronicznie przez zdarzenia
domenowe z trwałym rejestrem publikacji (Spring Modulith Event Publication Registry na JDBC — wzorzec outbox).
Mikroserwisy: brak uzasadnienia na tym etapie; kandydaci do wydzielenia w przyszłości: generowanie obrazów
(CPU), AI (koszty/limity), wysyłka e-maili.

### ADR-003: Współdzielona baza, `tenant_id`, dwie warstwy izolacji
1. **Aplikacja**: encje należące do dzierżawy mają pole `@TenantId` (Hibernate 7, dyskryminator). Hibernate
   automatycznie dodaje `tenant_id = :bieżąca` do każdego zapytania i ustawia `tenant_id` przy zapisie.
   Bieżąca dzierżawa pochodzi wyłącznie z `TenantContext`, ustawianego przez serwer (członkostwo lub domena).
2. **Baza danych**: PostgreSQL Row Level Security. Aplikacja łączy się rolą `shopivo_app` **bez** `BYPASSRLS`,
   niebędącą właścicielem tabel. Przy każdym pobraniu połączenia z puli ustawiane są zmienne sesji
   `app.tenant_id`, `app.user_id`, `app.bypass_rls`. Polityki RLS dopuszczają wiersze tylko bieżącej dzierżawy.
   Nawet błąd w kodzie (np. natywne SQL bez filtra) nie ujawni danych innego sklepu.
3. **Kontekst systemowy** (panel admina, zadania przekrojowe, routing domen) — jawne `SystemContext.run(...)`,
   które ustawia `bypass_rls=on` i tryb „root” Hibernate. Każde użycie jest przeglądane w code review
   (grep `SystemContext`).

Migracje Flyway wykonuje osobna rola właściciela schematu (`spring.flyway.user`).

### ADR-004: Uwierzytelnianie przeglądarkowe — nieprzezroczyste tokeny sesji w ciasteczku HttpOnly
Zamiast JWT w `localStorage`: losowy token 256-bit w ciasteczku `__Host-shopivo_session`
(`HttpOnly; Secure; SameSite=Lax; Path=/`), w bazie przechowywany wyłącznie skrót SHA-256 (`user_sessions`).
Zalety: natychmiastowe unieważnianie (wylogowanie, „wyloguj wszędzie”, blokada konta), lista aktywnych sesji,
brak problemu odwoływania JWT. Wymaganie „refresh token” realizuje sesja przesuwna (idle timeout) z twardym
limitem życia i rotacją tokenu przy podniesieniu uprawnień (po MFA).

CSRF (po przeglądzie bezpieczeństwa): double-submit z ciasteczkiem `__Host-XSRF-TOKEN` (HttpOnly; prefiks
`__Host-` uniemożliwia nadpisanie z subdomeny) i tokenem przyjmowanym **wyłącznie z nagłówka** `X-XSRF-TOKEN`
(nie z parametru formularza). SPA pobiera token z treści odpowiedzi `GET /api/v1/auth/csrf`; token jest rotowany
przy logowaniu, kroku MFA i wylogowaniu, a przy `403 CSRF_INVALID` klient pobiera nowy i ponawia żądanie raz.
Zarządzanie sesją Spring Security jest wyłączone (sesje to nasze tokeny, nie `HttpSession`).

### ADR-005: Rozdzielenie płatności SaaS i płatności sklepów
`billing` (platforma pobiera opłaty od sprzedawców — konto operatora platformy) jest całkowicie oddzielony od
`payments` (klienci sklepów płacą sprzedawcom — konta operatorów należące do sprzedawców, ich poświadczenia
szyfrowane per dzierżawa). Oba używają tych samych adapterów operatorów z modułu `payments`
(`PaymentGateway`: Przelewy24, PayU, Tpay) — różni się tylko właściciel poświadczeń. Webhooki: weryfikacja podpisu,
idempotencja po `provider + event_id`, ponawianie (Faza 2: `billing`; Faza 5: płatności sklepów).

### ADR-013: Subskrypcje zarządzane przez Shopivo, opłacane przez polskich operatorów (Faza 2)
**Decyzja (Q-02 rozstrzygnięte przez właściciela: bez Stripe).** Cykl życia subskrypcji (okres próbny, okresy
rozliczeniowe, odnowienia, zmiana planu z proracją, karencja, wygaśnięcie, kupony, VAT) prowadzi Shopivo
(`subscriptions`). Operator (Przelewy24 / PayU / Tpay, wybierany i konfigurowany przez administratora platformy w
panelu, dane szyfrowane AES-GCM) służy wyłącznie do pobrania pojedynczej płatności przez link płatności; wynik
przychodzi podpisanym powiadomieniem. Sprzedawca płaci za każdy okres (przypomnienia e-mail na 7 i 3 dni przed
końcem okresu) — bez kart zapisanych u operatora i bez płatności cyklicznych.
**Uzasadnienie:** polscy sprzedawcy oczekują BLIK/przelewów; płatności cykliczne P24/PayU wymagają osobnych umów i
dają niejednolite API; własny silnik daje jeden model niezależny od operatora i umożliwia zmianę operatora w panelu.
**Konsekwencje:** brak automatycznego obciążania (ryzyko spóźnień → 7 dni karencji, potem tryb tylko do odczytu);
fakturowanie VAT/KSeF (Q-06) nadal otwarte; adaptery napisane wg publicznej dokumentacji operatorów i przetestowane
na atrapie HTTP — **przed uruchomieniem produkcyjnym wymagają testu na sandboxach operatorów**.

### ADR-015: Ceny, VAT i magazyn w zamówieniach (Faza 3)
- Ceny wariantów są wprowadzane tak, jak pokazuje je sklep (domyślnie brutto; przy `prices_include_tax = false` brutto
  wyliczane ze stawki produktu). Zamówienie przechowuje migawkę cen i stawek; VAT zawarty liczony per pozycja, dostawa i
  opłata za pobranie — stawką 23% (uproszczenie; stawka dostawy „za towarem” do rozważenia przy fakturach, Q-06).
- Stan to `on_hand` i `reserved`. Złożenie zamówienia rezerwuje towar warunkowym `UPDATE … WHERE on_hand - reserved >= qty`
  (bez blokad aplikacyjnych — dwóch klientów nie kupi ostatniej sztuki; potwierdzone testem współbieżnym). Wysyłka
  zdejmuje towar ze stanu (ruch `SALE`), anulowanie przed wysyłką zwalnia rezerwację. Przy sprzedaży „na minusie”
  rezerwacje mogą przekraczać stan — przyjęcia towaru są wtedy zawsze dozwolone, zmniejszenia nie mogą zejść poniżej rezerwacji.
  Waluty sklepu nie można zmienić, gdy istnieją ceny lub zamówienia (`CurrencyChangeGuard`). Nieopłacone przelewy są anulowane
  automatycznie po terminie ustawionym przez sklep.
- Omnibus: każda zmiana ceny zamyka okres w `variant_price_history`; „najniższa cena z 30 dni przed obniżką” to minimum
  cen obowiązujących w 30 dniach przed wejściem bieżącej ceny.

### ADR-014: Limity planów i koszty („czy tani plan nie zje serwera?”)
Limity są danymi (`plan_entitlements`, nadpisania per sklep). Dwa rodzaje: **twarde** (produkty, zespół, miejsce na
pliki, kredyty AI) blokują dodawanie zasobu (HTTP 402 `ENTITLEMENT_LIMIT`), **uczciwe użytkowanie** (zamówienia i
odsłony sklepu miesięcznie) **nigdy** nie blokuje sklepu ani zakupów klientów — po przekroczeniu sklep jest
oznaczany, właściciel dostaje e-mail z propozycją wyższego planu, administrator widzi go w raporcie „Zużycie i
rentowność” (przychód netto vs. szacowany koszt z konfigurowalnego modelu kosztów). Zużycie liczone tanio w Redisie
(HINCRBY) i zrzucane do `tenant_usage` co 5 min. Ochrona techniczna przed nadmiernym ruchem (limity zapytań per IP,
cache HTTP odpowiedzi storefrontu, w przyszłości CDN) działa niezależnie od planu.

### ADR-006: Storefront jako jedna aplikacja Angular SSR
Jeden proces Node (Angular SSR) obsługuje wszystkie sklepy. Sklep rozpoznawany po nagłówku `Host`.
SSR wywołuje backend `/api/v1/storefront/**`, przekazując `X-Forwarded-Host`. Backend ufa temu nagłówkowi
**tylko** z zaufanych adresów proxy (konfiguracja `server.forward-headers-strategy` + lista zaufanych sieci).
Motywy: patrz ADR-016 (zrealizowane jako presety ustawień jednego układu). Serwer SSR (`apps/storefront/src/server.ts`)
proksuje `/api/v1/storefront/**`, `/api/v1/media/**`, `/sitemap.xml` i `/robots.txt` do backendu, ustawia nagłówki
bezpieczeństwa (CSP) i zwraca prawdziwe kody HTTP (404 dla nieznanego sklepu/produktu/kategorii, 503 gdy backend nie
odpowiada). Koszyk, checkout i potwierdzenie renderowane są tylko w przeglądarce (dane per klient).

### ADR-007: Domeny — wildcard + Cloudflare for SaaS
Subdomeny platformy: rekord `*.shopivo.pl` → origin storefrontu; nowa subdomena działa natychmiast po zapisie
w `store_domains` (zero operacji DNS). Domeny własne: Cloudflare for SaaS „Custom Hostnames” — API tworzy hostname,
Cloudflare wydaje certyfikat (walidacja HTTP/TXT), sprzedawca ustawia CNAME na `customers.shopivo.pl`.
Zadanie w tle odpytuje status i aktywuje mapowanie. Bez poświadczeń Cloudflare funkcja jest wyłączona
(nie udajemy, że działa).

### ADR-012: Oddzielna domena rejestrowalna dla witryn sklepów (REKOMENDACJA — wymagana przed Fazą 7)
Witryny sklepów na `*.shopivo.pl` są tym samym „site” (w rozumieniu SameSite) co panel `app.shopivo.pl`.
`SameSite=Lax` nie chroni wtedy przed żądaniami z witryn, a od Fazy 7 sprzedawcy osadzają własne skrypty (GTM,
Meta Pixel). Obecne zabezpieczenia (ciasteczka `__Host-`, token CSRF tylko z nagłówka, brak CORS) czynią to
bezpiecznym, ale zalecana jest separacja na poziomie domen (jak `myshopify.com` vs `shopify.com`):
panele i API na `shopivo.pl` (`app.`, `admin.`), witryny na osobnej domenie, np. `*.shopivo.shop`.
Konfiguracja: `SHOPIVO_PLATFORM_DOMAIN` = domena witryn. Decyzja właściciela — pytanie Q-03.

### ADR-008: Identyfikatory i pieniądze
- Klucze główne: UUID v7 (porządek czasowy → dobra lokalność indeksów), generowane w aplikacji.
- Numery widoczne dla ludzi (zamówienia, faktury): sekwencje per dzierżawa (`tenant_counters`).
- Kwoty: `BIGINT` w groszach (jednostkach minimalnych) + `CHAR(3)` waluty ISO 4217. Nigdy `float`.
- Czas: `timestamptz`, w Javie `Instant`; strefa prezentacji z ustawień sklepu (domyślnie `Europe/Warsaw`).

### ADR-009: Zadania w tle świadome dzierżawy
- Zdarzenia domenowe niosą `tenantId`; listener ustawia `TenantContext` przed logiką (`TenantAwareListener`).
- Zadania cykliczne: `@Scheduled` + blokada rozproszona (ShedLock na PostgreSQL), iteracja po dzierżawach w
  partiach, każda partia we własnym kontekście dzierżawy.
- Kolejka zadań (Faza 3+): tabela `jobs` z `SELECT … FOR UPDATE SKIP LOCKED`, `tenant_id`, retry z backoff.

### ADR-010: Cache świadomy dzierżawy
Klucze Redis zawsze z prefiksem `t:{tenantId}:`; globalne z `g:`. Rozpoznawanie domeny → dzierżawa: cache
dwupoziomowy (lokalny Caffeine 30 s + Redis) z unieważnianiem zdarzeniem przy zmianie domeny.

### ADR-011: Pliki (zaimplementowane w Fazie 4a)
Interfejs `ObjectStorage` z dwiema implementacjami: S3 (AWS SDK v2 — AWS S3, Cloudflare R2, MinIO) i katalog lokalny
(tylko dev/test — aplikacja odmawia startu z `local` w profilach `prod`/`production`/`staging`). Klucze:
`t/{tenantId}/{assetId}/{orig|w400|w1200}.jpg`. Upload przez backend: typ rozpoznawany po sygnaturze (JPEG/PNG),
wymiary sprawdzane z nagłówka **przed** dekodowaniem (maks. 8000 px / 40 MP — ochrona przed „bombami”), warianty
JPEG 400 i 1200 px generowane synchronicznie (ImageIO). Pliki z magazynu usuwane dopiero po zatwierdzeniu transakcji
(a nowe — po jej wycofaniu). Limit miejsca z planu (`storage.max_mb`) przez SPI `MediaQuotaPolicy`. Serwowanie przez
backend z `immutable` (gotowe pod CDN). WebP/AVIF i asynchroniczne przetwarzanie — później.

### ADR-016: Motywy jako presety + ustawienia (Faza 4a)
Zamiast osobnych bibliotek komponentów na motyw (pierwotny pomysł z ADR-006) motyw = zestaw wartości dla jednego,
dobrze przetestowanego układu witryny: kolory, krój pisma, zaokrąglenia, układ strony głównej, styl kart, teksty.
`ThemeRegistry` (backend) jest jedynym źródłem pól i 8 presetów (Fashion, Beauty, Electronics, Toys, Home, Sports,
Automotive, Jewelry) i waliduje każdą wartość (kolory `#RRGGBB`, listy dozwolonych opcji, długości) — do CSS
trafiają wyłącznie zwalidowane wartości jako zmienne `--sf-*`. Szkic i wersja opublikowana są rozdzielone; podgląd
szkicu przez krótkotrwały token HMAC (`X-Store-Preview`, 2 h) — odpowiedzi podglądu nie są cache'owane. Kroje pisma
wyłącznie systemowe (bez zewnętrznych serwerów czcionek: szybkość, RODO). Nowe układy sekcji można dodać w
przyszłości jako kolejne pola rejestru bez zmiany kontraktu API.

### ADR-018: Treści i dokumenty prawne (Faza 4b)
Treść stron to mały podzbiór Markdown parsowany do danych (`libs/shared-models/rich-text.ts`, wspólny dla witryny i
podglądu w panelu) i renderowany wiązaniami Angulara — bez `innerHTML`, linki tylko `https:`/`mailto:`/`tel:`/względne.
Regulamin i polityka prywatności są wymagane do publikacji sklepu; wzory wypełniane danymi firmy powstają jako szkic z
widocznymi znacznikami „[uzupełnij…]” (blokują publikację sklepu). Każda publikacja zmienionego tekstu tworzy niezmienną
wersję, a zamówienie zapisuje wersję regulaminu zaakceptowaną przez klienta. Przekierowania 301: zmiana adresu
opublikowanego produktu, kategorii, strony lub wpisu dodaje je automatycznie; serwer SSR pyta o przekierowanie tylko po
404 i przyjmuje wyłącznie cele względne (bez otwartych przekierowań).

### ADR-019: Konta klientów sklepu (Faza 4d)
Konta klientów są osobne dla każdego sklepu i niezależne od użytkowników platformy (inne tabele, inne ciasteczko).
Sesja to nieprzezroczysty token w ciasteczku HttpOnly bez atrybutu `Domain` (nie trafia do innych sklepów w domenie
platformy); serwer SSR przekazuje do API wyłącznie to ciasteczko i tylko dla `/account/**`. CSRF: wymagany nagłówek
`X-Requested-With` (żądanie z innej domeny wymaga preflightu CORS, którego API nie dopuszcza) + `SameSite=Lax`.
Konto widzi zamówienia złożone na swój adres e-mail, dlatego logowanie wymaga potwierdzenia adresu, a aktywacja wymaga
linku **i** hasła ustawionego w tej rejestracji — kto zarejestruje cudzy adres, nie przejmie konta, nawet gdy właściciel
skrzynki kliknie link. Opinie z konta korzystają z tej samej weryfikacji zakupu co link z e-maila.

### ADR-020: Płatności online sklepów (Faza 5a)
Każdy sklep używa **własnego** konta u operatora (Przelewy24 / PayU / Tpay) — pieniądze trafiają wprost do sprzedawcy,
Shopivo nie jest pośrednikiem płatności (bez licencji KIP/PSD2) i nie widzi danych kart (płatność na stronie operatora).
Te same bezstanowe adaptery obsługują subskrypcje platformy i sklepy (poświadczenia w każdym wywołaniu). Dane
dostępowe sklepu są szyfrowane AES-GCM z danymi powiązanymi „sklep + operator” i nigdy nie wracają do przeglądarki.
Adres powiadomień zawiera identyfikator sklepu wyłącznie po to, by wybrać klucz weryfikujący podpis — powiadomienie jest
wiarygodne tylko dzięki podpisowi. Moduł `orders` zna płatności online wyłącznie przez SPI `OnlinePayments`.

### ADR-017: Publikacja sklepu (Faza 4a)
Sklep startuje jako szkic. Publikacja wymaga kompletu danych sprzedawcy wymaganych przy sprzedaży na odległość (firma,
NIP, adres, e-mail), aktywnego produktu, sposobu dostawy i metody płatności — moduły zgłaszają braki przez SPI
`StorePublishCheck`, więc `stores` nie zależy od `catalog`/`orders`. Nieopublikowany sklep: strona „w przygotowaniu”,
`noindex`, `robots.txt` blokuje wszystko, koszyk/checkout → 404. Zmiana waluty jest blokowana, gdy istnieją
produkty lub zamówienia (SPI `CurrencyChangeGuard`).

## 3. Moduły backendu

| Moduł | Odpowiedzialność | Zależy od |
|---|---|---|
| `shared` | Typy wspólne: błędy, `Money`, paginacja, `TenantContext`, szyfrowanie, zegar | — |
| `authentication` | Logowanie, sesje, MFA, reset hasła, weryfikacja e-mail, OAuth2 Google, ochrona przed brute force | users, audit |
| `users` | Konta użytkowników, profil, role platformowe | — |
| `tenants` | Dzierżawy, członkostwa, zaproszenia, macierz uprawnień | users, audit |
| `stores` | Konfiguracja sklepu, ustawienia, tworzenie sklepu (orkiestracja) | tenants, domains |
| `domains` | Subdomeny, domeny własne, weryfikacja DNS, Cloudflare | — |
| `subscriptions` | Plany, ceny, limity, cykl subskrypcji, opłaty, kupony, pomiar zużycia, raport rentowności | billing, tenants, stores, users, email |
| `billing` | Wybór/konfiguracja operatora dla subskrypcji, linki płatności, odbiór powiadomień (SPI `BillingEventHandler`) | payments |
| `payments` (adaptery) | Przelewy24, PayU, Tpay (+ symulator dev/test): rejestracja płatności, weryfikacja podpisów | — |
| `catalog` | Produkty, warianty, kategorie, marki, magazyn (rezerwacje, ruchy), historia cen; SPI `ProductLimitPolicy` | stores |
| `customers` | Klienci sklepu, zgody marketingowe | — |
| `orders` | Koszyk, checkout, zamówienia, sposoby dostawy, płatności offline, e-maile, zadania | catalog, customers, stores |
| `payments`, `shipping`, `integrations` | Adaptery operatorów, poświadczenia, webhooki | — |
| `discounts`, `marketing`, `reviews` | Promocje, newsletter, porzucone koszyki, opinie | — |
| `media` | Pliki (S3/lokalnie), przetwarzanie zdjęć, limity miejsca (SPI `MediaQuotaPolicy`) | — |
| `themes` | Rejestr pól i presetów, szkic/publikacja motywu | — |
| `storefront` | Publiczne API witryny (BFF): konfiguracja sklepu, katalog, sitemap, robots | stores, themes, catalog |
| `storepayments` | Płatności online sklepów z kontem sprzedawcy u operatora: szyfrowane dane, próby płatności, powiadomienia (SPI `OnlinePayments` z `orders`) | orders, payments, stores |
| `shared.captcha` | Weryfikacja CAPTCHA (Turnstile; wyłączona tylko lokalnie i w testach) | — |
| `accounts` | Konta klientów sklepu: rejestracja z potwierdzeniem, sesje w ciasteczku na domenie sklepu, historia zamówień, adresy, opinie z konta | orders, reviews, stores, email |
| `reviews` | Opinie od zweryfikowanych kupujących: zaproszenia po realizacji zamówienia, moderacja, odpowiedzi, podsumowania | orders, email, stores |
| `content` | Strony, blog, dokumenty prawne (wzory, wersje), przekierowania 301 (SPI `StorePublishCheck`) | stores |
| `notifications`, `email` | Powiadomienia, szablony, wysyłka | — |
| `analytics`, `ai`, `support`, `admin`, `audit` | Statystyki, AI, zgłoszenia, panel admina, dziennik audytu | — |

Struktura modułu:
```
pl.shopivo.products
 ├─ ProductFacade.java          (publiczne API modułu)
 ├─ ProductDto.java, events…    (publiczne typy)
 ├─ web/                        (kontrolery REST — cienkie)
 └─ internal/                   (encje JPA, repozytoria, logika — niewidoczne dla innych modułów)
```
Encje JPA nigdy nie opuszczają modułu ani nie są zwracane przez REST.

## 4. Struktura repozytorium

```
/backend                Spring Boot (Maven), Flyway w src/main/resources/db/migration
/frontend               workspace Angular (jeden package.json, wspólne biblioteki)
   /apps/merchant-dashboard   SPA panelu sprzedawcy  (app.shopivo.pl)
   /apps/platform-admin       SPA panelu administratora (admin.shopivo.pl)
   /apps/storefront           Angular SSR — witryny sklepów
   /libs/shared-ui            system projektowy (komponenty Tailwind)
   /libs/shared-models        typy DTO (docelowo generowane z OpenAPI)
   /libs/api-client           klient HTTP, interceptory, obsługa błędów
   /libs/theme-engine         kontrakt motywu, rejestr sekcji, motywy
/docker                 Dockerfile'e, skrypty init bazy
/infrastructure         IaC (Terraform — Faza 6/8), konfiguracje Cloudflare
/docs                   dokumentacja
/.github/workflows      CI/CD
```

Uzasadnienie jednego workspace'u Angular: wspólny system projektowy, modele i klient API bez publikowania pakietów;
budowanie aplikacji niezależnie (`ng build <projekt>`).

## 5. Rozpoznawanie dzierżawy

| Kanał | Ścieżka | Źródło dzierżawy | Weryfikacja |
|---|---|---|---|
| Panel sprzedawcy | `/api/v1/tenants/{tenantId}/**` | parametr ścieżki | członkostwo zalogowanego użytkownika w `tenantId` (aktywne, dzierżawa nie zawieszona); brak → 404 (nie ujawniamy istnienia) |
| Storefront | `/api/v1/storefront/**` | nagłówek `Host`/`X-Forwarded-Host` | aktywny rekord `store_domains`; sklep opublikowany |
| Panel admina | `/api/v1/admin/**` | brak (kontekst systemowy) | rola `PLATFORM_ADMIN`/`PLATFORM_SUPPORT` |
| Webhooki | `/api/v1/webhooks/{provider}/{tenantId?}` | identyfikator w URL + podpis | weryfikacja podpisu kluczem dzierżawy |

`tenant_id` przesłany w body jest ignorowany — DTO go nie zawierają.

## 6. Obserwowalność
- Logi JSON (structured logging Spring Boot) z `traceId`, `tenantId`, `userId` w MDC; maskowanie danych wrażliwych.
- Actuator: `health` (liveness/readiness), `prometheus`, `info`; endpointy zarządzania na osobnym porcie.
- Śledzenie: Micrometer Tracing + OTLP (Faza 8). Błędy: Sentry (opcjonalnie, przez zmienną środowiskową).

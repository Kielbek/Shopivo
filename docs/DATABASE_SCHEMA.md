# Shopivo — schemat bazy danych

PostgreSQL 16+. Wszystkie zmiany wyłącznie przez Flyway (`backend/src/main/resources/db/migration`).
`spring.jpa.hibernate.ddl-auto=validate` — Hibernate tylko weryfikuje zgodność encji ze schematem.

## 1. Konwencje

| Element | Konwencja |
|---|---|
| Nazwy | `snake_case`, tabele w liczbie mnogiej |
| Klucz główny | `id uuid` (UUID v7 generowany w aplikacji) |
| Dzierżawa | `tenant_id uuid NOT NULL REFERENCES tenants(id)` w każdej tabeli danych sklepu |
| Audyt wiersza | `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` |
| Blokada optymistyczna | `version bigint NOT NULL DEFAULT 0` w encjach edytowanych współbieżnie |
| Kwoty | `*_amount bigint` (grosze) + `currency char(3)` |
| Statusy | `varchar` + `CHECK` (łatwiejsza ewolucja niż typy `ENUM`) |
| Unikalność w dzierżawie | indeksy unikalne zaczynają się od `tenant_id` (np. `(tenant_id, slug)`) |
| E-maile | `citext` lub `lower(email)` w indeksie unikalnym |
| Usuwanie | twarde, chyba że wymagana historia — wtedy `deleted_at` + indeks częściowy |
| Indeksy | każdy FK ma indeks; indeksy złożone z `tenant_id` na początku |

## 2. Role bazy danych i RLS

| Rola | Uprawnienia | Użycie |
|---|---|---|
| `shopivo_owner` (nazwa wg środowiska) | właściciel schematu | Flyway |
| `shopivo_app` | `SELECT/INSERT/UPDATE/DELETE` na tabelach, `USAGE` na sekwencjach; **bez** `BYPASSRLS`, nie jest właścicielem | aplikacja |

Zmienne sesji ustawiane przy każdym pobraniu połączenia z puli (`TenantAwareDataSource`):

| Zmienna | Znaczenie |
|---|---|
| `app.tenant_id` | UUID bieżącej dzierżawy lub `''` |
| `app.user_id` | UUID zalogowanego użytkownika lub `''` |
| `app.bypass_rls` | `on` tylko w `SystemContext` |

Funkcje pomocnicze (migracja V1): `app_current_tenant()`, `app_current_user()`, `app_bypass_rls()`.

Wzorzec polityki dla tabel dzierżawy:
```sql
ALTER TABLE x ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON x
  USING (app_bypass_rls() OR tenant_id = app_current_tenant())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());
```

## 3. Tabele — Faza 1 (zaimplementowane)

### users
| Kolumna | Typ | Uwagi |
|---|---|---|
| id | uuid PK | |
| email | varchar(320) | unikalny `lower(email)` |
| password_hash | varchar(255) NULL | Argon2id/bcrypt (DelegatingPasswordEncoder); NULL dla kont tylko-OAuth |
| first_name, last_name | varchar(100) | |
| status | varchar(20) | `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `DELETED` |
| platform_role | varchar(30) NULL | `PLATFORM_ADMIN`, `PLATFORM_SUPPORT` |
| email_verified_at | timestamptz NULL | |
| locale | varchar(10) | domyślnie `pl-PL` |
| failed_login_count, locked_until | int, timestamptz | ochrona przed brute force (poza Redisem — trwała blokada) |
| mfa_enabled | boolean | |
| last_login_at, created_at, updated_at, version | | |

### user_sessions
`id`, `user_id` FK, `token_hash` (varchar(64), unikalny), `created_at`, `last_seen_at`, `idle_expires_at`,
`absolute_expires_at`, `revoked_at`, `revoke_reason`, `ip_address` (inet), `user_agent` (varchar 512),
`mfa_verified` (boolean). Indeks: `(user_id) WHERE revoked_at IS NULL`.

### user_tokens
Jednorazowe tokeny: weryfikacja e-mail, reset hasła, zaproszenie. `id`, `user_id` FK NULL, `purpose`,
`token_hash` (unikalny), `expires_at`, `consumed_at`, `created_at`. Przechowywany wyłącznie skrót.

### user_mfa_totp
`user_id` PK/FK, `secret_encrypted` (AES-256-GCM, wersjonowany klucz), `confirmed_at`, `created_at`.
### user_recovery_codes
`id`, `user_id`, `code_hash`, `used_at`.

### user_oauth_identities
`id`, `user_id`, `provider` (`GOOGLE`), `subject`, `email`, `created_at`; unikalne `(provider, subject)`.

### tenants
`id`, `name`, `status` (`ACTIVE`, `SUSPENDED`, `CLOSED`), `suspended_reason`, `created_by` FK users,
`created_at`, `updated_at`, `version`. **Bez RLS** (dostęp kontrolowany członkostwem; tabela nie zawiera
danych sklepu). Dane rozliczeniowe dzierżawy — Faza 2 (`tenant_billing_profiles`, z RLS).

### tenant_memberships
`id`, `tenant_id`, `user_id`, `role`, `status` (`ACTIVE`, `DISABLED`), `created_at`, `updated_at`;
unikalne `(tenant_id, user_id)`.
RLS (V2): `SELECT` — `bypass OR tenant_id = bieżąca OR user_id = bieżący użytkownik` (lista „moje sklepy”);
`INSERT/UPDATE/DELETE` — wyłącznie `bypass OR tenant_id = bieżąca`. Użytkownik nie może modyfikować własnego
członkostwa w obcym sklepie nawet surowym SQL.

### tenant_invitations
`id`, `tenant_id`, `email`, `role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`, `revoked_at`,
`created_at`. RLS dzierżawy.

### stores
`id`, `tenant_id` (unikalny — ADR-001), `name`, `slug` (unikalny globalnie — subdomena), `status`
(`DRAFT`, `PUBLISHED`, `SUSPENDED`), `default_locale`, `default_currency`, `timezone`, `contact_email`,
`created_at`, `updated_at`, `version`. RLS dzierżawy (+ bypass dla routingu domen).

### store_settings
`id` PK, `tenant_id` (unikalny), `legal_company_name`, `tax_id` (NIP), `address_*`, `phone`, `order_email`,
`prices_include_tax`, `updated_at`, `version`. RLS dzierżawy.

### store_domains
`id`, `tenant_id`, `hostname` (unikalny, lowercase), `type` (`PLATFORM_SUBDOMAIN`, `CUSTOM`), `status`
(`PENDING_VERIFICATION`, `VERIFIED`, `ACTIVE`, `FAILED`, `REMOVED`), `is_primary`, `verification_token`,
`provider_hostname_id`, `ssl_status`, `last_checked_at`, `created_at`, `updated_at`.
Indeks unikalny częściowy: jedna domena główna per dzierżawa. RLS dzierżawy.

### audit_logs
`id`, `tenant_id` NULL (zdarzenia platformowe), `actor_user_id` NULL, `actor_type` (`USER`, `SYSTEM`,
`PLATFORM_ADMIN`), `action` (np. `auth.login.succeeded`), `target_type`, `target_id`, `ip_address`,
`metadata jsonb` (bez danych wrażliwych), `created_at`. Tylko INSERT dla roli aplikacji (brak UPDATE/DELETE).
RLS: dzierżawa widzi swoje wpisy; wpisy platformowe tylko w kontekście systemowym.

### event_publication (Spring Modulith)
Rejestr publikacji zdarzeń (outbox) — schemat zgodny z Spring Modulith JDBC.

### shedlock
Blokady zadań cyklicznych.

## 4. Tabele — Faza 2 (zaimplementowane, migracja V3)

| Tabela | RLS | Opis |
|---|---|---|
| `subscription_plans` | — | Plany (kod, nazwa, kolejność, aktywny, publiczny, dni próby, `version`) |
| `plan_prices` | — | Ceny netto (`MONTH`/`YEAR`, waluta, kwota); zmiana ceny = nowy wiersz, stary `active=false` (obecni klienci zachowują cenę) |
| `plan_entitlements` | — | `(plan_id, key) → value`; `-1` = bez limitu |
| `billing_coupons` | — | Rabat % lub kwotowy, `ONCE`/`REPEATING`/`FOREVER`, limit użyć, ważność |
| `platform_payment_providers` | — | Konfiguracja operatorów platformy; `credentials_encrypted` (AES-GCM, AAD = operator); jeden `active_for_billing` |
| `webhook_events` | — | Powiadomienia operatorów; unikalne `(provider, event_id)` — idempotencja; status/próby/błąd |
| `subscriptions` | ✔ | Jedna na dzierżawę: status, plan, cena, okres, próba, karencja, zaplanowana zmiana, kupon |
| `subscription_events` | ✔ | Historia (tylko INSERT dla roli aplikacji) |
| `subscription_charges` | ✔ | Opłaty: numer `SUB-RRRR-NNNNNN`, rodzaj, okres, kwota katalogowa, rabat, netto, stawka i kwota VAT, brutto, operator, przypomnienia; maks. jedna `OPEN` na rodzaj |
| `coupon_redemptions` | ✔ | Jedno użycie kuponu na sklep |
| `entitlement_overrides` | ✔ | Wyjątki od limitów per sklep (powód, autor, wygaśnięcie) |
| `tenant_usage` | ✔ | Liczniki miesięczne `(tenant, metric, period)` |

## 5. Tabele — Faza 3 (zaimplementowane, migracje V4–V5; wszystkie z RLS)

| Tabela | Opis |
|---|---|
| `categories` | Drzewo: `parent_id` + zmaterializowana ścieżka `path` (`/id/id/`), `depth` ≤ 4, `slug` unikalny w sklepie |
| `brands` | Marki |
| `products` | Status (`DRAFT`/`ACTIVE`/`ARCHIVED`), typ (`PHYSICAL`/`DIGITAL`), stawka VAT (0/5/8/23%), opcje jako JSON (≤ 3), SEO, `version` |
| `product_categories` | Przypisania produkt ↔ kategoria |
| `product_variants` | Wartości opcji (JSON), SKU (unikalne w sklepie, bez wielkości liter), EAN (GTIN), cena, cena przed obniżką, koszt, waga/wymiary, śledzenie stanu, sprzedaż na minusie |
| `variant_price_history` | Okresy cen wariantu (Omnibus) |
| `inventory_items` | `on_hand`, `reserved`, próg niskiego stanu (jeden magazyn) |
| `inventory_movements` | Dziennik ruchów — tylko INSERT dla aplikacji |
| `customers` | Klienci (unikalny e-mail w sklepie), zgoda marketingowa z datą, statystyki zamówień |
| `shipping_methods` | Sposoby dostawy |
| `store_payment_settings` | Przelew (IBAN), pobranie (opłata), termin płatności |
| `carts`, `cart_items` | Koszyki (skrót tokenu), czyszczone po 30 dniach |
| `tenant_counters` | Liczniki per sklep (numery zamówień od 1001) |
| `orders` | Migawka danych klienta, adresów (JSON), dostawy i kwot; statusy; skrót tokenu klienta |
| `order_items` | Migawka nazwy/SKU/ceny/VAT; `reserved_qty` |
| `order_events` | Historia i notatki — tylko INSERT dla aplikacji |

## 5a. Tabele — Faza 4a (migracje V6–V7; z RLS)

| Tabela / zmiana | Opis |
|---|---|
| `stores.published_at` | Data publikacji sklepu (status `PUBLISHED`) |
| `media_assets` | Zdjęcia: `owner_type` (`PRODUCT`), `owner_id`, `storage_key` (unikalny prefiks `t/{tenant}/{id}/`), wymiary, `total_bytes` (wszystkie warianty — do limitu planu), `alt`, `position` |
| `store_themes` | Klucz `tenant_id`; `draft_json`, `published_json` (walidowane przez `ThemeRegistry`), `published_at`, `version` (optymistyczna blokada) |
| indeksy V6 | `orders_unpaid_transfer_idx` (częściowy, auto-anulowanie), `carts_updated_idx` (czyszczenie koszyków) |

## 5b. Tabele — Faza 4b (migracja V8; z RLS)

| Tabela / zmiana | Opis |
|---|---|
| `content_entries` | Strony (`PAGE`) i wpisy (`POST`): `slug` unikalny w rodzaju, `system_key` (`TERMS`, `PRIVACY`, `RETURNS`, `SHIPPING` — najwyżej jeden każdego), treść ≤ 100 000 znaków (podzbiór Markdown), `status`, `show_in_footer`, SEO, `published_revision`, `version` |
| `content_revisions` | Niezmienne kopie każdej opublikowanej wersji (`REVOKE UPDATE` dla roli aplikacji) |
| `seo_redirects` | `from_path` → `to_path` (oba zaczynają się od `/`, różne), `automatic`; łańcuchy spłaszczane przy zapisie |
| `orders.terms_revision_id` | Wersja regulaminu zaakceptowana przy zamówieniu |

## 5c. Tabele — Faza 4c (migracja V9; z RLS)

| Tabela | Opis |
|---|---|
| `review_invitations` | Jedno zaproszenie na zamówienie: skrót tokenu (unikalny), `expires_at` (90 dni) |
| `product_reviews` | `product_id`, `order_id` (unikalna para), `author_name`, `rating` 1–5, `body`, `status` (`PENDING`/`APPROVED`/`REJECTED`), `reply`, moderacja (kto, kiedy) |

## 5d. Tabele — Faza 4d (migracja V10; z RLS)

| Tabela | Opis |
|---|---|
| `customer_accounts` | Konto klienta sklepu: `email` (małe litery, unikalny w sklepie), `password_hash` (Argon2id), `email_verified_at`, licznik nieudanych logowań i blokada |
| `customer_account_tokens` | Jednorazowe linki `VERIFY`/`RESET` (skrót), `pending_password_hash` — hasło z rejestracji, do której należy link |
| `customer_sessions` | Sesje (skrót tokenu ciasteczka), wygasają po 30 dniach; sprzątane codziennie |
| `customer_addresses` | Zapisane adresy (do 10), domyślny |
| indeks `orders_email_lower_idx` | Historia zamówień konta po e-mailu |

## 5e. Tabele — Faza 4e (migracja V11; z RLS)

| Tabela | Opis |
|---|---|
| `store_navigation` | Menu nagłówka sklepu: `items_json` (etykieta + ścieżka w sklepie), `version` |

## 5f. Tabele — Faza 5a (migracja V12; z RLS)

| Tabela / zmiana | Opis |
|---|---|
| `orders.payment_method` | dodane `ONLINE` |
| `store_payment_providers` | Konto operatora sklepu (jedno): `provider_id`, `credentials_enc` (AES-GCM, AAD = sklep + operator), `sandbox`, `enabled`, `verified_at` |
| `order_payments` | Próby płatności (id = identyfikator dla operatora), kwota, waluta, status `PENDING/PAID/FAILED`, identyfikator u operatora |
| `store_payment_events` | Powiadomienia operatora (unikalny `event_key` w sklepie — idempotencja) z wynikiem (`PAID`, `AMOUNT_MISMATCH`, `UNKNOWN_PAYMENT`…) |

## 5g. Tabele — Faza 5b (migracja V13; z RLS)

| Tabela / zmiana | Opis |
|---|---|
| `shipping_methods.carrier` | Powiązany przewoźnik (np. `inpost`) albo `NULL` |
| `orders.pickup_point_json`, `orders.shipping_carrier` | Wybrany paczkomat (kopia z chwili zamówienia: kod, nazwa, adres) i przewoźnik metody |
| `store_carrier_accounts` | Konto sklepu u przewoźnika (PK `tenant_id` + `carrier_id`): `credentials_enc` (AES-GCM, AAD = sklep + przewoźnik), `sandbox`, `enabled`, `verified_at` |
| `shipments` | Przesyłki: `external_id`, `tracking_number`, `status` (`PENDING`…`DELIVERED`/`FAILED`/`CANCELED`), `carrier_status`, `parcel_json`, `last_checked_at`, `error` |

## 5h. Zmiany — usprawnienia UX katalogu (migracja V14)

| Zmiana | Opis |
|---|---|
| `stores.industry` | Branża sklepu (35 kodów, `CHECK`), `NULL` = nie wybrano; służy wyłącznie podpowiedziom w panelu |

## 5i. Tabele — dane dokumentów prawnych (migracja V15; z RLS)

| Tabela | Opis |
|---|---|
| `store_legal_settings` | Dane używane we wzorach (poza danymi firmy z `store_settings`): `shipping_time`, `effective_date`, `returns_address` (NULL = adres firmy), `analytics_tools`, `marketing_tools`, `version` |

## 5j. Obrazy motywu i kategorii (migracja V16)

`media_assets.owner_type` przyjmuje dodatkowo `THEME` (biblioteka zdjęć motywu; `owner_id` = id sklepu, maks. 40) i
`CATEGORY` (jedno zdjęcie na kategorię; nowe zastępuje stare, usunięcie kategorii usuwa plik). Sekcje strony głównej
są przechowywane w istniejącym JSON-ie motywu (`store_themes`), więc nie wymagają nowej tabeli.

## 5k. Newsletter (migracja V17; z RLS)

| Tabela | Opis |
|---|---|
| `newsletter_subscribers` | `email` (unikalny w sklepie), `status` `PENDING`/`CONFIRMED`/`UNSUBSCRIBED`, skróty SHA-256 tokenów potwierdzenia i wypisu (same tokeny nie są zapisywane), `confirm_sent_at` (ponowna wysyłka maks. raz na 24 h), `consent_text` i `confirmed_at` (dowód zgody), `source`, `unsubscribed_at` |

## 5l. Ulubione i zwroty (migracja V18; z RLS)

| Tabela | Opis |
|---|---|
| `customer_wishlist` | Ulubione produkty konta klienta (`account_id`, `product_id`, PK z obu); usuwane razem z kontem lub produktem; maks. 200 na konto |
| `return_requests` | Zgłoszenie klienta: `number` (kolejny w sklepie), `order_id`, `kind` `WITHDRAWAL` (odstąpienie, 14 dni od doręczenia) / `COMPLAINT` (reklamacja, 2 lata od wysyłki), `status` `REQUESTED` → `ACCEPTED`/`REJECTED` → `COMPLETED`, `reason`, `refund_account` (26 cyfr), `merchant_note` (widoczna dla klienta), `version` |
| `return_request_items` | Pozycje zgłoszenia (`order_item_id`, `quantity`); suma zgłoszeń nieodrzuconych nie przekroczy ilości w zamówieniu |

## 6. Tabele — kolejne fazy (projekt)

| Faza | Tabele |
|---|---|
| 2 (pozostałe) | `billing_invoices` (faktury VAT/KSeF — Q-06), `tenant_billing_profiles` (dane do faktury) |
| 3 (pozostałe) | `discounts`, `discount_usage` |
| 5 | `integrations`, `integration_credentials` (szyfrowane), `payments`, `payment_transactions`, `refunds`, `shipments`, `shipment_events`, `shipping_methods`, `shipping_zones` |
| 6 | rozszerzenia `store_domains`, `domain_checks` |
| 7 | `abandoned_carts`, `marketing_settings`, `analytics_daily` (agregaty), `ai_usage`, `ai_jobs` |
| 8 | `support_tickets`, `support_messages`, `notifications`, `email_templates`, `email_log`, `data_requests` (RODO), `platform_settings` |

Projekt szczegółowy każdej tabeli zostanie dopisany do tego dokumentu w momencie implementacji fazy
(migracja + opis), aby dokumentacja nie rozjeżdżała się z kodem.

## 7. Strategia indeksowania i wydajności
- Wszystkie listy paginowane (keyset dla dużych zbiorów: zamówienia, ruchy magazynowe; offset dla małych).
- Wyszukiwanie produktów: `tsvector` (konfiguracja `simple` + `unaccent`; polski słownik ispell opcjonalnie) z
  indeksem GIN; w przyszłości OpenSearch/Meilisearch, jeśli zajdzie potrzeba.
- Agregaty analityczne liczone przyrostowo do tabel dziennych, nie z surowych zamówień przy każdym żądaniu.
- Pula połączeń HikariCP: rozmiar ~ (2 × rdzenie) na instancję; przy wielu replikach — PgBouncer w trybie
  transakcyjnym (**uwaga**: zmienne sesji RLS ustawiamy wtedy przez `SET LOCAL` w transakcji — zaplanowane w Fazie 8).

## 8. Kopie zapasowe
Patrz `DEPLOYMENT.md` §6.

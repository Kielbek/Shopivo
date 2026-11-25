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
`id`, `user_id` FK, `token_hash` (char(64), unikalny), `created_at`, `last_seen_at`, `idle_expires_at`,
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
RLS: `app_bypass_rls() OR tenant_id = app_current_tenant() OR user_id = app_current_user()` — użytkownik
widzi swoje członkostwa we wszystkich sklepach (lista „moje sklepy”), a w kontekście dzierżawy cały zespół.

### tenant_invitations
`id`, `tenant_id`, `email`, `role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`, `revoked_at`,
`created_at`. RLS dzierżawy.

### stores
`id`, `tenant_id` (unikalny — ADR-001), `name`, `slug` (unikalny globalnie — subdomena), `status`
(`DRAFT`, `PUBLISHED`, `SUSPENDED`), `default_locale`, `default_currency`, `timezone`, `contact_email`,
`created_at`, `updated_at`, `version`. RLS dzierżawy (+ bypass dla routingu domen).

### store_settings
`tenant_id` PK, `legal_company_name`, `tax_id` (NIP), `address_*`, `phone`, `order_email`,
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

## 4. Tabele — kolejne fazy (projekt)

| Faza | Tabele |
|---|---|
| 2 | `subscription_plans`, `plan_prices` (okres, waluta, kwota), `plan_entitlements` (klucz, wartość), `subscriptions`, `subscription_events` (historia), `subscription_payments`, `billing_invoices`, `billing_coupons`, `tenant_billing_profiles`, `webhook_events` (provider, event_id unikalne — idempotencja), `entitlement_overrides` |
| 3 | `products`, `product_variants`, `product_options`, `product_option_values`, `product_images`, `categories` (drzewo: `parent_id` + `path ltree`), `product_categories`, `brands`, `inventory_items`, `inventory_movements`, `customers`, `customer_addresses`, `customer_consents`, `carts`, `cart_items`, `orders`, `order_items`, `order_addresses`, `order_status_history`, `order_notes`, `returns`, `complaints`, `discounts`, `discount_usage`, `tenant_counters`, `wishlists` |
| 4 | `themes` (globalne), `theme_configurations` (draft/published, JSON), `pages`, `blog_posts`, `navigation_menus`, `seo_redirects`, `reviews`, `media_assets`, `media_variants` |
| 5 | `integrations`, `integration_credentials` (szyfrowane), `payments`, `payment_transactions`, `refunds`, `shipments`, `shipment_events`, `shipping_methods`, `shipping_zones` |
| 6 | rozszerzenia `store_domains`, `domain_checks` |
| 7 | `newsletter_subscribers`, `abandoned_carts`, `marketing_settings`, `analytics_daily` (agregaty), `ai_usage`, `ai_jobs` |
| 8 | `support_tickets`, `support_messages`, `notifications`, `email_templates`, `email_log`, `data_requests` (RODO), `platform_settings` |

Projekt szczegółowy każdej tabeli zostanie dopisany do tego dokumentu w momencie implementacji fazy
(migracja + opis), aby dokumentacja nie rozjeżdżała się z kodem.

## 5. Strategia indeksowania i wydajności
- Wszystkie listy paginowane (keyset dla dużych zbiorów: zamówienia, ruchy magazynowe; offset dla małych).
- Wyszukiwanie produktów: `tsvector` (konfiguracja `simple` + `unaccent`; polski słownik ispell opcjonalnie) z
  indeksem GIN; w przyszłości OpenSearch/Meilisearch, jeśli zajdzie potrzeba.
- Agregaty analityczne liczone przyrostowo do tabel dziennych, nie z surowych zamówień przy każdym żądaniu.
- Pula połączeń HikariCP: rozmiar ~ (2 × rdzenie) na instancję; przy wielu replikach — PgBouncer w trybie
  transakcyjnym (**uwaga**: zmienne sesji RLS ustawiamy wtedy przez `SET LOCAL` w transakcji — zaplanowane w Fazie 8).

## 6. Kopie zapasowe
Patrz `DEPLOYMENT.md` §6.

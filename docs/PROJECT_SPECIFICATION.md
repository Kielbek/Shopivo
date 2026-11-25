# Shopivo — specyfikacja produktu

> Status dokumentu: wersja 1.0 (Faza 0). Dokument żywy — aktualizowany po każdej fazie.

## 1. Wizja

Shopivo to wielodzierżawna (multi-tenant) platforma SaaS do tworzenia i prowadzenia sklepów internetowych bez
programowania, administrowania serwerami i ręcznych wdrożeń. Model biznesowy: subskrypcja.

Rynek startowy: **Polska** (język polski, PLN, VAT 23/8/5/0%, Przelewy24/PayU/BLIK, InPost/DPD/DHL).
Architektura od początku przygotowana na i18n, wiele walut, konfiguracje podatkowe i regionalne integracje.

Wszystkie sklepy działają na **jednej, współdzielonej infrastrukturze**. Utworzenie sklepu to operacja aplikacyjna
(wiersz w bazie + rekord domeny), a nie nowe wdrożenie.

## 2. Aktorzy

| Aktor | Opis | Interfejs |
|---|---|---|
| Gość / Klient sklepu | Przegląda sklep, kupuje, ma (opcjonalnie) konto w danym sklepie | Storefront (SSR) |
| Sprzedawca (Merchant) | Użytkownik platformy, członek jednego lub wielu sklepów z rolą | Panel sprzedawcy |
| Administrator platformy | Pracownik właściciela platformy | Panel administratora |
| Systemy zewnętrzne | Operatorzy płatności, przewoźnicy, Cloudflare, dostawcy AI | Webhooki / API |

Role w sklepie: `OWNER`, `ADMIN`, `MANAGER`, `PRODUCT_MANAGER`, `ORDER_MANAGER`, `CUSTOMER_SUPPORT`
(macierz uprawnień: `docs/SECURITY.md`).

Role platformowe: `PLATFORM_ADMIN` (pełny dostęp), `PLATFORM_SUPPORT` (odczyt + obsługa zgłoszeń).

## 3. Kluczowe pojęcia domenowe

- **Użytkownik (User)** — konto platformy (sprzedawca lub administrator). Globalne, nie należy do dzierżawy.
- **Dzierżawa (Tenant)** — jednostka izolacji danych i rozliczeń. **1 dzierżawa = 1 sklep** (patrz ADR-001 w
  `ARCHITECTURE.md`). Ma własną subskrypcję.
- **Sklep (Store)** — konfiguracja witryny sklepu (nazwa, język, waluta, motyw, domeny). Należy do dzierżawy.
- **Członkostwo (Membership)** — powiązanie użytkownika z dzierżawą wraz z rolą.
- **Klient sklepu (Customer)** — kupujący w konkretnym sklepie. Konto klienta jest **per sklep** (ten sam e-mail
  w dwóch sklepach = dwa niezależne konta) — zgodne z oczekiwaniami RODO i izolacją danych.
- **Plan / Uprawnienia (Plan / Entitlements)** — konfigurowalne limity i funkcje przypisane do subskrypcji.

## 4. Zakres funkcjonalny (skrót)

Pełna lista wymagań pochodzi z promptu projektowego. Poniżej podział na moduły i fazy realizacji.

| Obszar | Moduły backendu | Faza |
|---|---|---|
| Rdzeń: konta, dzierżawy, uprawnienia, audyt | authentication, users, tenants, stores, admin, audit, notifications, email | 1 |
| Rozliczenia SaaS | subscriptions, billing | 2 |
| Silnik e-commerce | products, categories, inventory, customers, carts, checkout, orders, discounts | 3 |
| Storefront, motywy, SEO, treści | themes, content, seo, media, reviews | 4 |
| Płatności i wysyłka sprzedawców | payments, shipping, integrations | 5 |
| Domeny i infrastruktura | domains | 6 |
| Marketing, analityka, AI | marketing, analytics, ai | 7 |
| Utwardzanie i produkcja | (przekrojowo), support | 8 |

## 5. Wymagania niefunkcjonalne

| Kategoria | Wymaganie | Miara docelowa |
|---|---|---|
| Skalowalność | Tysiące sklepów na współdzielonej infrastrukturze | 5 000 sklepów, 200 req/s storefrontu na instancję |
| Wydajność storefrontu | Core Web Vitals | LCP < 2,5 s, INP < 200 ms, CLS < 0,1 (p75, mobile) |
| Wydajność API | Czas odpowiedzi | p95 < 300 ms dla odczytów panelu |
| Dostępność | SLA | 99,9% miesięcznie (wymaga HA bazy i ≥ 2 instancji) |
| Bezpieczeństwo | Izolacja dzierżaw | Dwie niezależne warstwy: aplikacja (Hibernate `@TenantId`) + PostgreSQL RLS |
| Dane | RPO / RTO | RPO ≤ 5 min (PITR), RTO ≤ 1 h |
| Zgodność | RODO, prawo konsumenckie UE/PL | patrz `SECURITY.md` §9 — wymaga przeglądu prawnego |
| Dostępność cyfrowa | WCAG 2.1 AA | panel i motywy |
| Język | UI po polsku | gotowość na i18n (klucze tłumaczeń, `locale` sklepu) |

## 6. Plany subskrypcyjne (wartości startowe — konfigurowalne)

Limity i funkcje są **danymi** (`subscription_plans` + `plan_entitlements`), a nie stałymi w kodzie.
Kod sprawdza uprawnienia przez `EntitlementService.check(tenantId, Entitlement.X)`.

| Uprawnienie (klucz) | STARTER | BUSINESS | PROFESSIONAL |
|---|---|---|---|
| `products.max` | 100 | 1 000 | 25 000 |
| `themes.premium` | nie | tak | tak |
| `domains.custom` | nie | tak | tak |
| `marketing.tools` | nie | tak | tak |
| `analytics.level` | basic | advanced | advanced |
| `integrations.external` | nie | tak | tak |
| `ai.enabled` / `ai.monthly_credits` | nie / 0 | nie / 0 | tak / konfig. |
| `support.priority` | nie | nie | tak |
| `staff.max` | 2 | 5 | 15 |
| `storage.max_mb` | 1 024 | 10 240 | 51 200 |

Ceny — do ustalenia przez właściciela platformy (pytanie otwarte Q-05).

## 7. Poza zakresem MVP (świadomie)

- Wielosklepowość w ramach jednej subskrypcji (architektura nie blokuje — `stores.tenant_id`).
- Marketplace aplikacji firm trzecich.
- Własny procesor kart płatniczych (platforma nie przetwarza ani nie przechowuje danych kart — PCI DSS SAQ A).
- Edytor drag & drop (przygotowane fundamenty: sekcje motywu jako JSON ze schematem).

## 8. Pytania otwarte (wymagają decyzji właściciela)

| ID | Pytanie | Wpływ | Domyślne założenie do czasu decyzji |
|---|---|---|---|
| Q-01 | Dostawca chmury (GCP / AWS / Azure / DigitalOcean / OVH) i region | Deployment, koszty, RODO | Agnostycznie: kontenery + zarządzany PostgreSQL/Redis/S3 w UE; rekomendacja: GCP `europe-central2` (Warszawa) |
| Q-02 | Operator rozliczeń subskrypcji SaaS (Stripe Billing vs. Przelewy24/PayU z płatnościami cyklicznymi) | Faza 2 | **Rozstrzygnięte:** bez Stripe — polscy operatorzy (Przelewy24, PayU, Tpay), subskrypcje prowadzone przez Shopivo (ADR-013) |
| Q-03 | Domena platformy (np. `shopivo.pl`) i **osobna** domena dla subdomen sklepów (np. `shopivo.shop`) — patrz ADR-012 | Faza 6, bezpieczeństwo ciasteczek | Konfiguracja `SHOPIVO_PLATFORM_DOMAIN`, lokalnie `shopivo.localhost` |
| Q-04 | Plan Cloudflare — „Cloudflare for SaaS” (Custom Hostnames) jest wymagany dla domen własnych z automatycznym SSL | Faza 6 | Zakładamy Cloudflare for SaaS |
| Q-05 | Cennik planów, okres próbny, waluty rozliczeń | Faza 2 | Zaimplementowane jako dane edytowalne w panelu: 14 dni próby (plan Business), PLN netto + 23% VAT; kwoty w migracji V3 to przykłady do ustalenia |
| Q-06 | Fakturowanie subskrypcji (KSeF!) — od 2026 obowiązkowy KSeF dla faktur B2B w PL | Faza 2 → otwarte | **Nie zaimplementowane.** Opłaty mają netto/VAT/brutto, ale faktur ani KSeF nie ma — wymaga decyzji (Fakturownia/inFakt API vs. natywnie) i konsultacji księgowej |
| Q-07 | Dostawca AI (OpenAI / Anthropic / inny) i budżety | Faza 7 | Abstrakcja `AiProvider` |
| Q-08 | Dane spółki, regulaminy, polityka prywatności, DPA | Prawne | Szablony oznaczone „WYMAGA PRZEGLĄDU PRAWNEGO” |

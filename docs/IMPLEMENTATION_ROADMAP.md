# Shopivo — plan implementacji

Legenda: `[x]` zrobione i przetestowane · `[~]` częściowo · `[ ]` do zrobienia.
Bieżący stan szczegółowy i wyniki testów: `docs/PROGRESS.md`.

## Faza 0 — audyt i architektura
- [x] Audyt repozytorium (wynik: repozytorium puste — projekt od zera)
- [x] Weryfikacja wersji: Java 21, Spring Boot 4.1.x, Angular 22, Tailwind 4, PostgreSQL 17
- [x] Dokumenty: specyfikacja, architektura (ADR), schemat bazy, API, bezpieczeństwo, wdrożenie, roadmapa
- [x] Lista pytań otwartych (`PROJECT_SPECIFICATION.md` §8)

## Faza 1 — rdzeń platformy
Backend
- [ ] Szkielet Spring Boot, profile, Problem Details, OpenAPI, Actuator, logowanie
- [ ] Flyway V1: role, funkcje RLS, users, sessions, tokens, MFA, tenants, memberships, invitations, stores,
      store_settings, store_domains, audit_logs, event_publication, shedlock
- [ ] `TenantContext`, `TenantAwareDataSource` (zmienne sesji RLS), Hibernate `@TenantId`, `SystemContext`
- [ ] Rejestracja, weryfikacja e-mail, logowanie, wylogowanie, reset hasła, zmiana hasła
- [ ] Sesje w ciasteczku HttpOnly, CSRF, lista/unieważnianie sesji
- [ ] Ochrona przed brute force (Redis + blokada konta), limity zapytań
- [ ] MFA TOTP + kody zapasowe
- [ ] Google OAuth2 (warunkowo, gdy skonfigurowany)
- [ ] Tworzenie sklepu (dzierżawa + sklep + subdomena + OWNER), lista sklepów
- [ ] Członkostwa, role, macierz uprawnień, zaproszenia
- [ ] Panel admina — API: przegląd, sklepy, użytkownicy, zawieszanie
- [ ] Dziennik audytu
- [ ] E-maile transakcyjne (szablony Thymeleaf, wysyłka asynchroniczna przez zdarzenia)
- [ ] Testy: jednostkowe, integracyjne (Testcontainers), izolacja dzierżaw (API + RLS), modularność
Frontend
- [ ] Workspace Angular (3 aplikacje + biblioteki), Tailwind 4, strict TS
- [ ] System projektowy `shared-ui` (przyciski, pola, alerty, karty, tabela, stany puste/ładowania/błędu)
- [ ] `api-client`: HttpClient, CSRF, obsługa Problem Details
- [ ] Panel sprzedawcy: logowanie, rejestracja, weryfikacja, reset hasła, MFA, onboarding sklepu,
      powłoka panelu, ustawienia sklepu, zespół, konto i sesje
- [ ] Panel admina: logowanie, przegląd, sklepy, użytkownicy
- [ ] Storefront: szkielet SSR (pełna implementacja — Faza 4)
Infrastruktura
- [ ] Docker Compose (Postgres, Redis, Mailpit, MinIO), Dockerfile backendu
- [ ] GitHub Actions CI

## Faza 2 — rozliczenia SaaS
- [ ] Plany, ceny, uprawnienia (dane), panel admina planów
- [ ] `EntitlementService` + egzekwowanie limitów (402)
- [ ] Adapter `BillingProvider` (Stripe — wg decyzji Q-02), checkout subskrypcji
- [ ] Cykl życia: trial, aktywacja, odnowienie, upgrade/downgrade (proration), anulowanie, okres karencji,
      nieudane płatności + retry, zawieszenie sklepu po karencji
- [ ] Webhooki (podpis, idempotencja), historia, faktury, kupony, ceny promocyjne
- [ ] Testy cyklu subskrypcji i webhooków

## Faza 3 — silnik e-commerce
- [ ] Produkty (draft/opublikowany, fizyczne/cyfrowe), warianty i opcje, zdjęcia, marki, SKU/EAN, wymiary, SEO
- [ ] Kategorie (drzewo), magazyn + ruchy, alerty niskich stanów
- [ ] Import/eksport CSV, edycja masowa
- [ ] Klienci sklepu (konta per sklep), adresy, zgody, segmentacja, eksport
- [ ] Koszyk (gość/klient, trwały), rabaty, wyliczanie podatków (VAT PL) i dostawy
- [ ] Checkout (gość/konto, zgody), zamówienia, statusy, historia, notatki, anulowanie, zwroty, reklamacje
- [ ] Omnibus — historia cen
- [ ] Testy cyklu zamówienia i izolacji

## Faza 4 — storefront i motywy
- [ ] Routing po hoście (SSR), cache konfiguracji sklepu
- [ ] Silnik motywów (kontrakt, rejestr sekcji, schematy JSON), konfiguracja draft/publish, podgląd
- [ ] 8 motywów: Fashion, Beauty, Electronics, Toys, Home, Sports, Automotive, Jewelry
- [ ] Strony: główna, katalog, produkt, koszyk, checkout, konto klienta, CMS, blog
- [ ] SEO: meta, canonical, sitemap per sklep, robots.txt, JSON-LD (Product, Breadcrumb, Organization), OG, przekierowania
- [ ] Media: upload S3, warianty obrazów, CDN, limity
- [ ] Opinie produktów

## Faza 5 — płatności i wysyłka sprzedawców
- [ ] Szyfrowane poświadczenia, test połączenia, statusy integracji
- [ ] Płatności: Przelewy24, PayU, Stripe (adaptery), webhooki, uzgadnianie, zwroty
- [ ] Wysyłka: InPost (Paczkomaty + kurier), DPD, DHL — etykiety, śledzenie
- [ ] Fakturownia, BaseLinker, Allegro (zakres do ustalenia)

## Faza 6 — domeny i infrastruktura chmurowa
- [ ] Domeny własne: rejestracja, weryfikacja DNS/własności, Cloudflare Custom Hostnames, SSL, status,
      domena główna, usuwanie, zadania w tle
- [ ] IaC (Terraform), konfiguracja produkcyjna, HTTPS/HSTS

## Faza 7 — marketing, analityka, AI
- [ ] Rabaty zaawansowane, darmowa dostawa, newsletter, porzucone koszyki, banery, rekomendacje
- [ ] GA4, GTM, Meta Pixel (z Consent Mode)
- [ ] Analityka sklepu (agregaty dzienne), panel statystyk
- [ ] AI: abstrakcja dostawcy, limity/koszty per dzierżawa, generowanie treści, tłumaczenia, asystent

## Faza 8 — utwardzanie i produkcja
- [ ] Testy E2E (Playwright): rejestracja → sklep → motyw → produkt → koszyk → zamówienie → subskrypcja → domena
- [ ] Testy obciążeniowe, optymalizacja zapytań, Core Web Vitals
- [ ] Monitoring, alerty, tracing, Sentry, runbooki, testy odtwarzania kopii
- [ ] RODO: eksport/usuwanie danych, retencja; zgłoszenia supportu; tryb serwisowy; ustawienia platformy
- [ ] Przegląd bezpieczeństwa, pentest zewnętrzny

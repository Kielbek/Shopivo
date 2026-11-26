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
- [x] Szkielet Spring Boot, profile, Problem Details, OpenAPI, Actuator, logowanie
- [x] Flyway V1: role, funkcje RLS, users, sessions, tokens, MFA, tenants, memberships, invitations, stores,
      store_settings, store_domains, audit_logs, event_publication, shedlock
- [x] `TenantContext`, `TenantAwareDataSource` (zmienne sesji RLS), Hibernate `@TenantId`, `SystemContext`
- [x] Rejestracja, weryfikacja e-mail, logowanie, wylogowanie, reset hasła, zmiana hasła
- [x] Sesje w ciasteczku HttpOnly, CSRF, lista/unieważnianie sesji
- [x] Ochrona przed brute force (Redis + blokada konta), limity zapytań
- [x] MFA TOTP + kody zapasowe
- [~] Google OAuth2 (zaimplementowane, aktywne profilem `google`; nieprzetestowane z prawdziwym Google)
- [x] Tworzenie sklepu (dzierżawa + sklep + subdomena + OWNER), lista sklepów
- [x] Członkostwa, role, macierz uprawnień, zaproszenia
- [x] Panel admina — API: przegląd, sklepy, użytkownicy, zawieszanie
- [x] Dziennik audytu
- [x] E-maile transakcyjne (szablony Thymeleaf, wysyłka asynchroniczna przez zdarzenia)
- [x] Testy: jednostkowe, integracyjne (Testcontainers), izolacja dzierżaw (API + RLS), modularność (E2E w repo — Faza 8)
Frontend
- [x] Workspace Angular (3 aplikacje + biblioteki), Tailwind 4, strict TS
- [x] System projektowy `shared-ui` (przyciski, pola, alerty, karty, tabela, stany puste/ładowania/błędu)
- [x] `api-client`: HttpClient, CSRF, obsługa Problem Details
- [x] Panel sprzedawcy: logowanie, rejestracja, weryfikacja, reset hasła, MFA, onboarding sklepu,
      powłoka panelu, ustawienia sklepu, zespół, konto i sesje
- [x] Panel admina: logowanie, przegląd, sklepy, użytkownicy
- [x] Storefront: szkielet SSR z rozpoznawaniem sklepu po hoście (rozbudowany w Fazie 4a)
Infrastruktura
- [x] Docker Compose (Postgres, Redis, Mailpit, MinIO), Dockerfile backendu
- [x] GitHub Actions CI

## Faza 2 — rozliczenia SaaS
- [x] Plany, ceny, uprawnienia (dane), panel admina planów (ceny „grandfathered”)
- [x] `Entitlements` + egzekwowanie limitów (402) — na razie limit zespołu; produkty/pliki/AI podłączą się w swoich fazach
- [x] Adaptery Przelewy24 / PayU / Tpay (bez Stripe — ADR-013), wybór operatora w panelu admina, checkout subskrypcji
- [x] Cykl życia: trial, aktywacja, odnowienie, upgrade (proracja) / downgrade (od końca okresu), anulowanie, karencja,
      nieudane płatności, przypomnienia, tryb tylko do odczytu po wygaśnięciu
- [x] Webhooki (podpis, idempotencja, ponawianie), historia, kupony, VAT
- [x] Pomiar zużycia, fair use, raport rentowności, MRR/ARR
- [x] Testy cyklu subskrypcji i webhooków
- [ ] Faktury VAT / KSeF (Q-06) — **otwarte**
- [ ] Test adapterów na sandboxach operatorów (wymaga kont testowych)

## Faza 3 — silnik e-commerce
- [x] Produkty (szkic/aktywny/archiwum, fizyczne/cyfrowe), warianty i opcje, marki, SKU/EAN, wymiary, SEO
- [x] Zdjęcia produktów (Faza 4a)
- [x] Kategorie (drzewo), magazyn + ruchy, niskie stany
- [x] Eksport CSV, akcje masowe · [ ] Import CSV
- [x] Klienci sklepu (rejestr z zamówień), zgody, eksport zgód · [ ] konta klientów i adresy (Faza 4 — storefront)
- [x] Koszyk gościa, VAT PL, koszty dostawy · [ ] rabaty (Faza 7 — marketing)
- [x] Checkout gościa (zgody), zamówienia, statusy, historia, notatki, anulowanie · [ ] zwroty i reklamacje
- [x] Omnibus — historia cen
- [x] Testy cyklu zamówienia, izolacji i współbieżności

## Faza 4 — storefront i motywy
- [x] Routing po hoście (SSR), cache konfiguracji sklepu (4a)
- [x] Silnik motywów: rejestr pól i presetów (ADR-016), szkic/publikacja, podgląd tokenem (4a)
- [x] 8 motywów: Fashion, Beauty, Electronics, Toys, Home, Sports, Automotive, Jewelry (4a)
- [x] Publikacja sklepu z listą braków (4a)
- [x] Strony: główna, katalog, kategoria, wyszukiwarka, produkt, koszyk, checkout, potwierdzenie (4a) · [x] strony CMS z dokumentami prawnymi, blog (4b) · [x] konto klienta (4d)
- [x] SEO: meta, canonical, sitemap per sklep, robots.txt, JSON-LD (Product, Breadcrumb, Organization), OG (4a) · [x] przekierowania 301 (4b)
- [x] Media: upload S3, warianty obrazów, limity (4a) · [x] EXIF (4b) · [ ] CDN (Faza 6), WebP/AVIF
- [x] Opinie produktów od zweryfikowanych kupujących, moderacja (4c) · [x] konta klientów (4d) · [x] CAPTCHA, menu nawigacji (4e)

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

# Integracje płatności i przewoźników

Zbudowane według oficjalnej dokumentacji (pobranej w trakcie prac):
- Stripe Connect — docs.stripe.com (connect/direct-charges, api/accounts/create, api/account_links/create, connect/webhooks, webhooks — weryfikacja podpisu),
- Furgonetka — specyfikacja OpenAPI „Furgonetka.pl API REST” (furgonetka.pl/api/rest) i furgonetka.pl/api/oauth,
- Apaczka — api-docs.apaczka.pl (Web API v2: podpis HMAC, semantyka błędów, cykl zamówienia, tracking, sandbox).

Wszystkie integracje są przetestowane na lokalnych zamiennikach API (`FakeStripe`, `FakeCouriers` w testach,
`StripeConnectIT`, `CourierAggregatorsIT`) — **przed produkcją trzeba je sprawdzić na prawdziwych sandboxach** z kluczami.

## Płatności — Stripe Connect (platforma Shopivo)
- Sklep = konto połączone (country PL, pełny panel Stripe; opłaty Stripe płaci sklep, ryzyko ujemnego salda — Stripe:
  domyślne `controller`). Wnioskowane możliwości: karty, transfers, BLIK, Przelewy24.
- Kreator: `POST /tenants/{t}/online-payments/stripe/connect` → link `account_onboarding` (powrót `…/platnosci?stripe=powrot`,
  wygasły link `?stripe=odswiez` odnawia się sam). Status: `GET …/stripe`, `POST …/stripe/refresh`.
- Płatność: Checkout Session jako *direct charge* (nagłówek `Stripe-Account`), `client_reference_id` = id próby płatności;
  opcjonalna prowizja platformy `payment_intent_data[application_fee_amount]` (`SHOPIVO_STRIPE_APPLICATION_FEE_BPS`).
- Webhook platformy (zdarzenia kont połączonych): `POST /api/v1/webhooks/stripe-connect`, podpis `Stripe-Signature`
  (HMAC-SHA256 „t.payload”, tolerancja 5 min), sklep po polu `account`; `checkout.session.*` → opłacenie zamówienia
  (zgodność kwoty, idempotencja), `account.updated` → status konta.
- Konfiguracja serwera: `shopivo.stripe.secret-key`, `shopivo.stripe.connect-webhook-secret` (endpoint „Connected accounts”
  w panelu Stripe), opcjonalnie `shopivo.stripe.application-fee-bps`. Bez nich karta Stripe w panelu jest nieaktywna.
- Przelewy24 / PayU / Tpay — bez zmian: własne konto sprzedawcy i klucze (szyfrowane, tylko do zapisu).

## Przewoźnicy — agregatory
- **Furgonetka** (OAuth2 authorization code): `POST /tenants/{t}/carriers/furgonetka/connect` → logowanie w Furgonetce →
  `GET /api/v1/oauth/carriers/furgonetka/callback` (jednorazowy `state` w Redisie, 15 min) → tokeny szyfrowane; odświeżanie
  tokenu (jednorazowy refresh token) pod blokadą wiersza. Wymaga aplikacji OAuth Shopivo: `shopivo.furgonetka.client-id`,
  `shopivo.furgonetka.client-secret`; adres powrotu do zarejestrowania: `{public-api-url}/api/v1/oauth/carriers/furgonetka/callback`.
- **Apaczka**: App ID / App Secret sprzedawcy; każde żądanie podpisane (`app_id:route:request:expires`, HMAC-SHA256),
  sandbox `panel-sandbox.apaczka.pl` (bez trackingu — patrz dokumentacja Apaczki).
- Wybór kurierów: `GET/PUT /tenants/{t}/carriers/{id}/services` — zaznaczona usługa + rodzaj (kurier / punkt) + cena =
  gotowy sposób dostawy powiązany z `"{konto}:{usługa}"` (np. `apaczka:21`); odznaczone są wyłączane (zostają w historii).
- Przesyłka: nadawca = dane firmy z Ustawień; punkty odbioru z konta (Furgonetka `/points/map`, Apaczka `points/{TYP}/`);
  etykieta PDF; śledzenie (Furgonetka `/packages/{id}/tracking`, Apaczka `tracking/{list}/`).
- **InPost** bezpośrednio (ShipX) — bez zmian.

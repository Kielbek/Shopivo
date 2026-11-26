# Shopivo — wdrożenie i środowiska

## 1. Środowisko lokalne

Wymagania: Java 21+, Maven 3.9+, Node 22.22+ (lub 24.15+), Docker.

```bash
docker compose up -d            # PostgreSQL 17, Redis 7, Mailpit (SMTP + UI http://localhost:8025), MinIO (S3)
cd backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev   # http://localhost:8080
cd frontend && npm ci && npm run start:merchant                       # http://localhost:4200 (proxy /api → 8080)
cd frontend && npm run start:admin                                    # http://localhost:4300
```

Profil `dev` ładuje dane deweloperskie (`db/dev-seed`): administrator `admin@shopivo.local` (hasło w
`application-dev.yml`, tylko lokalnie). Dane seed **nigdy** nie są ładowane w produkcji (osobna lokalizacja Flyway
włączana tylko profilem `dev`).

Baza lokalna: skrypt `docker/postgres/init/01-roles.sql` tworzy role `shopivo_owner` (Flyway) i `shopivo_app`
(aplikacja, podlega RLS).

## 2. Zmienne środowiskowe backendu

| Zmienna | Wymagana | Opis |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | tak | `prod` / `staging` / `dev` |
| `SHOPIVO_DB_URL` | tak | `jdbc:postgresql://host:5432/shopivo?sslmode=require` |
| `SHOPIVO_DB_APP_USER` / `SHOPIVO_DB_APP_PASSWORD` | tak | rola aplikacji (bez BYPASSRLS) |
| `SHOPIVO_DB_MIGRATION_USER` / `SHOPIVO_DB_MIGRATION_PASSWORD` | tak | właściciel schematu (Flyway) |
| `SHOPIVO_REDIS_URL` | tak | `rediss://…` |
| `SHOPIVO_ENCRYPTION_KEYS` | tak | `1:<base64 32B>,2:<base64 32B>` |
| `SHOPIVO_ENCRYPTION_ACTIVE_KEY` | tak | np. `2` |
| `SHOPIVO_PLATFORM_DOMAIN` | tak | np. `shopivo.pl` |
| `SHOPIVO_APP_URL` | tak | URL panelu sprzedawcy (linki w e-mailach) |
| `SHOPIVO_ADMIN_URL` | tak | URL panelu administratora |
| `SHOPIVO_COOKIE_SECURE` | tak | `true` w każdym środowisku z HTTPS |
| `SHOPIVO_MAIL_HOST/PORT/USERNAME/PASSWORD` | tak | SMTP (np. Amazon SES, Postmark, Mailgun) |
| `SHOPIVO_MAIL_FROM` | tak | `Shopivo <no-reply@shopivo.pl>` (SPF/DKIM/DMARC skonfigurowane!) |
| `SHOPIVO_TRUSTED_PROXIES` | tak | regex adresów zaufanych proxy (load balancer, serwer SSR storefrontu) — tylko od nich honorowane są `X-Forwarded-For/Proto/Host`. **Uwaga:** LB/Cloudflare musi nadpisywać (nie przepuszczać) `X-Forwarded-Host` od klienta |
| `SHOPIVO_FLYWAY_ENABLED` | tak | `false` w podach aplikacji, `true` tylko w jobie migracji (patrz §5) |
| `SHOPIVO_REQUIRE_STAFF_MFA` | nie | domyślnie `true` — administratorzy platformy muszą mieć MFA |
| `SHOPIVO_LOG_FORMAT` | nie | `ecs` / `logstash` — logi JSON z `traceId`, `userId`, `tenantId` (MDC) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | nie | włącza logowanie Google |
| `SHOPIVO_STORAGE_TYPE` | tak (Faza 4) | `s3` w produkcji (`local` — tylko dev/test, w `prod`/`staging` aplikacja nie wystartuje) |
| `SHOPIVO_S3_ENDPOINT` / `SHOPIVO_S3_REGION` / `SHOPIVO_S3_BUCKET` | tak (Faza 4) | np. R2: `https://<konto>.r2.cloudflarestorage.com`, region `auto`; pusty endpoint = AWS S3 |
| `SHOPIVO_S3_ACCESS_KEY` / `SHOPIVO_S3_SECRET_KEY` | tak (Faza 4) | klucze z uprawnieniem tylko do tego bucketu (Put/Get/Delete) |
| `SHOPIVO_S3_PATH_STYLE` | nie | `true` dla MinIO |
| `SHOPIVO_STORAGE_LOCAL_DIR` | nie | katalog plików w trybie `local` |
| `SHOPIVO_MEDIA_MAX_CONCURRENT_PROCESSING` | nie | równoległe dekodowania zdjęć na instancję (domyślnie 2; każde do ~320 MB sterty — dobierz do `-Xmx`, min. 1 GB przy 2) |
| `SHOPIVO_CAPTCHA_PROVIDER` | tak (prod) | `turnstile` — w profilach `prod`/`staging` aplikacja nie wystartuje bez CAPTCHA |
| `SHOPIVO_CAPTCHA_SITE_KEY` / `SHOPIVO_CAPTCHA_SECRET_KEY` | tak (prod) | klucze widgetu Cloudflare Turnstile; w ustawieniach widgetu dodaj domenę platformy (obejmuje subdomeny sklepów) — domeny własne sklepów wymagają dopisania lub planu Enterprise |
| `SHOPIVO_STOREFRONT_URL_TEMPLATE` | nie | publiczny adres witryny, domyślnie `https://{host}` (sitemap, robots, link „Otwórz sklep”, podgląd); lokalnie `http://{host}:4000` |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | Faza 6 | domeny własne (Cloudflare for SaaS) |
| `SHOPIVO_PUBLIC_API_URL` | tak (Faza 2) | publiczny adres API widziany przez operatorów płatności (adres powiadomień `…/api/v1/webhooks/billing/<operator>`); domyślnie `SHOPIVO_APP_URL` |
| `SHOPIVO_TRIAL_PLAN` | nie | kod planu okresu próbnego (domyślnie `BUSINESS`) |
| `SHOPIVO_COST_*` | nie | model kosztów do raportu rentowności (grosze): `BASE_MINOR`, `PER_MILLION_REQUESTS_MINOR`, `PER_ORDER_MINOR`, `PER_GB_MINOR` |

Poświadczenia operatorów płatności (Przelewy24 / PayU / Tpay) **nie są** zmiennymi środowiskowymi — administrator
wpisuje je w panelu (Rozliczenia → Operatorzy płatności); są szyfrowane kluczem `SHOPIVO_ENCRYPTION_KEYS`.
Symulator płatności (`shopivo.payments.fake-gateway.enabled`) działa tylko lokalnie/w testach; aplikacja odmawia
startu, jeśli jest włączony w profilu `prod`/`production`/`staging`.
| `SENTRY_DSN` | nie | śledzenie błędów |

## 3. Architektura docelowa (agnostyczna względem chmury)

| Komponent | Usługa zarządzana (przykłady) | Uwagi |
|---|---|---|
| Backend | Cloud Run / ECS Fargate / Azure Container Apps / DO App Platform | ≥ 2 repliki, readiness `/actuator/health/readiness` |
| Storefront SSR | jw. (kontener Node) | ≥ 2 repliki, autoskalowanie po CPU/RPS |
| Panele SPA | Cloudflare Pages / bucket + CDN | statyczne pliki; `/api` kierowane do backendu regułą Cloudflare/LB |
| PostgreSQL | Cloud SQL / RDS / Azure Flexible Server | HA, PITR, szyfrowanie, prywatna sieć |
| Redis | Memorystore / ElastiCache / Upstash | TLS |
| Pliki | Cloudflare R2 / S3 / GCS | prywatny bucket + CDN |
| DNS/CDN/WAF/SSL | Cloudflare | Cloudflare for SaaS dla domen własnych |
| E-mail | SES / Postmark / Mailgun | SPF, DKIM, DMARC dla domeny nadawczej |

Rekomendacja startowa (do potwierdzenia — Q-01): GCP `europe-central2` (Warszawa) — Cloud Run + Cloud SQL +
Memorystore, pliki w Cloudflare R2 (brak opłat za transfer).

## 4. Konfiguracja Cloudflare (Faza 6 — wymagana ręcznie raz)
1. Strefa `shopivo.pl` w Cloudflare.
2. Rekordy: `app`, `admin` → panele; `api` (opcjonalnie); `*` (wildcard) → origin storefrontu (proxied).
3. Cloudflare for SaaS: fallback origin `customers.shopivo.pl` → storefront; token API z uprawnieniem
   `SSL and Certificates: Edit` + `Custom Hostnames`.
4. Sprzedawca z domeną własną ustawia `CNAME www.mojsklep.pl → customers.shopivo.pl` (i dla apex — ALIAS/CNAME
   flattening u swojego dostawcy lub przekierowanie apex→www). Bez tej konfiguracji domena nie zadziała —
   panel pokazuje dokładne instrukcje i status weryfikacji.

## 5. CI/CD (GitHub Actions)
- `ci.yml`: backend `mvn verify` (testy jednostkowe + integracyjne z Testcontainers), frontend `lint`, `test`,
  `build` dla wszystkich aplikacji; skan sekretów.
- `deploy.yml` (Faza 8): budowa obrazów → rejestr → migracje Flyway (osobny job z rolą właściciela) →
  wdrożenie backendu (rolling) → storefront → panele. Środowiska `staging` (auto z `main`) i `production`
  (ręczna akceptacja).

**Migracje jako osobny job** (ten sam obraz backendu): `SHOPIVO_FLYWAY_ENABLED=true` + poświadczenia właściciela
schematu, a pody aplikacji mają `SHOPIVO_FLYWAY_ENABLED=false` i **nie dostają** `SHOPIVO_DB_MIGRATION_*` —
skompromitowana aplikacja nie może wtedy zmienić schematu ani wyłączyć RLS.

Obrazy: `docker/backend.Dockerfile`, `docker/storefront.Dockerfile` (Node SSR, wymaga `SHOPIVO_API_URL`),
`docker/spa.Dockerfile --build-arg APP=merchant-dashboard|platform-admin` (nginx + nagłówki bezpieczeństwa).

Sondy: liveness `GET :8081/actuator/health/liveness`, readiness `GET :8081/actuator/health/readiness`
(baza danych; Redis celowo poza readiness — limiter działa w trybie fail-open).

Migracje muszą być wstecznie kompatybilne z poprzednią wersją aplikacji (expand → migrate → contract),
ponieważ wdrożenie rolling uruchamia obie wersje jednocześnie.

## 6. Kopie zapasowe i odtwarzanie
- PITR bazy (retencja 7–35 dni) + codzienny snapshot; kopie w innym regionie UE.
- Bucket plików: wersjonowanie obiektów + reguły cyklu życia.
- Redis: dane odtwarzalne (cache/limity) — bez kopii.
- Test odtworzenia: kwartalnie, procedura w `docs/runbooks/restore.md` (Faza 8).

## 7. Monitoring
Actuator + Prometheus (`/actuator/prometheus` na porcie zarządzania), dashboardy: RPS, p95, błędy 5xx, pula
połączeń, opóźnienie kolejki zdarzeń, nieudane webhooki. Alerty: dostępność, 5xx > 1%, zaległe publikacje
zdarzeń, nieudane weryfikacje domen, wygasające certyfikaty.

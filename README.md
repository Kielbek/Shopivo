# Shopivo

Wielodzierżawna platforma SaaS do tworzenia sklepów internetowych (rynek polski). Modularny monolit
Spring Boot 4 + Angular 22, PostgreSQL z Row Level Security, Redis.

- Specyfikacja i architektura: [`docs/`](docs/) (zacznij od `ARCHITECTURE.md`)
- Stan prac i wyniki testów: [`docs/PROGRESS.md`](docs/PROGRESS.md)
- Plan: [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md)

## Szybki start (lokalnie)

Wymagania: Java 21, Node 22.22+, Docker.

```bash
docker compose up -d postgres redis mailpit
```

```bash
cd backend && SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run
```

```bash
cd frontend && npm ci && npm run start:merchant
```

Panel sprzedawcy: http://localhost:4200 · panel admina (`npm run start:admin`): http://localhost:4300 ·
e-maile: http://localhost:8025 · API docs (dev): http://localhost:8080/api/swagger-ui

## Testy

```bash
cd backend && ./mvnw verify
```

```bash
cd frontend && npm test
```

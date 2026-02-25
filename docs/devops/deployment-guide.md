# Deployment Guide: WindparkManager (WPM)

> **Stand:** 25. Februar 2026
> **Version:** 2.0 (aktualisiert auf aktuelle Infrastruktur)

## Voraussetzungen

### Server-Anforderungen
- **OS**: Ubuntu 22.04 LTS, Debian 12, oder Windows (Portainer)
- **CPU**: 4+ Cores
- **RAM**: 8+ GB
- **Storage**: 100+ GB SSD
- **Docker**: 24.0+
- **Docker Compose**: 2.20+

### Domain & DNS
- Domain fuer die Anwendung (z.B. `wpm.example.com`)
- DNS A-Record zeigt auf Server-IP
- Optional: Subdomains fuer Storage (`storage.wpm.example.com`) und MinIO Console (`minio.wpm.example.com`)

---

## Deployment-Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI/CD                     │
├─────────────────────────────────────────────────────────────┤
│  1. Lint & Type-Check (eslint, tsc --noEmit)               │
│  2. Next.js Build (standalone output)                       │
│  3. Tests (Vitest, optional)                                │
│  4. Docker Build & Push → ghcr.io/blubbiii/wka_verwaltung   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│             Production Server (Portainer Stack)             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Traefik v3.0 (Reverse Proxy + SSL)                 │  │
│  │  - Port 80 → HTTPS Redirect                         │  │
│  │  - Port 443 → TLS (Let's Encrypt)                   │  │
│  │  - Security Headers + Rate Limiting                  │  │
│  └───────────┬──────────────────┬──────────────────┬───┘  │
│              │                  │                  │       │
│         ┌────▼────┐  ┌──────────▼────┐  ┌────────▼──┐   │
│         │ Next.js │  │  MinIO (S3)   │  │  Traefik  │   │
│         │ App     │  │  :9000/:9001  │  │ Dashboard │   │
│         │ :3000   │  │  (Dokumente)  │  │  :8080    │   │
│         └────┬────┘  └───────────────┘  └───────────┘   │
│              │                                           │
│         ┌────▼──────────────────────────┐               │
│         │  PostgreSQL 16 + Redis 7      │               │
│         │  (nicht extern exponiert)      │               │
│         └────┬──────────────────────────┘               │
│              │                                           │
│         ┌────▼──────────────────────────┐               │
│         │ Worker (2+ Replicas)          │               │
│         │ BullMQ Job Processing         │               │
│         │ (START_MODE=worker)           │               │
│         └───────────────────────────────┘               │
│              │                                           │
│         ┌────▼──────────────────────────┐               │
│         │ Backup (Cron)                 │               │
│         │ Daily 02:00, Weekly, Monthly  │               │
│         └───────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

---

## Docker Multi-Stage Dockerfile

Das Dockerfile nutzt 4 Stages fuer optimale Image-Groesse (~150MB):

```
Stage 1: deps        → Alpine Node 20, npm install (alle Dependencies)
Stage 2: builder     → Next.js Build (standalone Output, 4GB Memory Limit)
Stage 2b: prisma-cli → Isolierte Prisma CLI in /prisma-cli/ (KRITISCH!)
Stage 3: runner      → Production Image (Non-Root User nextjs:1001)
```

### KRITISCH: Prisma CLI Isolation

Die Prisma CLI **MUSS** in `/prisma-cli/` installiert sein (NICHT in `/app/node_modules/`), weil:
- Next.js Standalone Output bindet `@prisma/config` ein
- `@prisma/config` hat `effect` als transitive Dependency
- Next.js Standalone kopiert `@prisma/config` OHNE `effect`
- Ergebnis: `Cannot find module 'effect'` beim Start

**prisma-cli Stage installiert:**
- prisma@6, tsx, typescript, bcryptjs, @prisma/client@6

**Seed-Befehl im Container:**
```bash
NODE_PATH=/prisma-cli/node_modules /prisma-cli/node_modules/.bin/tsx prisma/seed.ts
```

---

## Docker Compose Konfigurationen

### Verfuegbare Compose-Dateien

| Datei | Zweck |
|-------|-------|
| `docker-compose.yml` | Generisches Production-Template mit Traefik |
| `docker-compose.dev.yml` | Lokale Entwicklung (DB, Redis, MinIO, Mailhog) |
| `docker-compose.prod.yml` | Vollstaendiges Production-Setup mit Ressourcen-Limits |
| `docker-compose.portainer.yml` | Portainer Stack fuer 192.168.178.101 |

### Services

| Service | Image | Ports | Beschreibung |
|---------|-------|-------|--------------|
| app | ghcr.io/blubbiii/wka_verwaltung:latest | 3000 | Next.js Application |
| worker | (gleich wie app) | - | BullMQ Worker (START_MODE=worker) |
| postgres | postgres:16-alpine | 5432 (intern) | Datenbank |
| redis | redis:7-alpine | 6379 (intern) | Cache + BullMQ |
| minio | minio/minio | 9000/9001 | S3-kompatibler Storage |
| minio-init | minio/mc | - | Bucket-Erstellung (One-Shot) |
| traefik | traefik:v3.0 | 80/443 | Reverse Proxy + SSL |
| backup | prodrigestivill/postgres-backup-local:15 | - | Automatische Backups |

---

## Schnellstart: Lokale Entwicklung

```bash
# 1. Infrastruktur starten
docker compose -f docker-compose.dev.yml up -d

# 2. Dependencies installieren
npm install

# 3. Datenbank synchronisieren (NICHT migrate deploy!)
npx prisma db push

# 4. Seed-Daten laden
npx tsx prisma/seed.ts

# 5. Entwicklungsserver starten
npm run dev
```

**Verfuegbare lokale Services:**
- App: http://localhost:3000
- PostgreSQL: localhost:5432 (wpm/devpassword)
- Redis: localhost:6379
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)
- Mailhog: http://localhost:8025 (SMTP: localhost:1025)

---

## Production Deployment

### 1. Umgebungsvariablen konfigurieren

```bash
cp .env.production.example .env
```

**Kritische Einstellungen:**

```env
# Application
APP_DOMAIN=wpm.example.com
NODE_ENV=production

# Database
POSTGRES_USER=wpm
POSTGRES_PASSWORD=<sicheres-passwort>
POSTGRES_DB=windparkmanager
DATABASE_URL=postgresql://wpm:<passwort>@postgres:5432/windparkmanager

# Auth (BEIDE setzen fuer Kompatibilitaet!)
AUTH_SECRET=<mindestens-32-zeichen>
NEXTAUTH_SECRET=<gleicher-wert>
NEXTAUTH_URL=https://wpm.example.com

# Redis
REDIS_URL=redis://redis:6379

# MinIO
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=<access-key>
S3_SECRET_KEY=<secret-key>
S3_BUCKET=wpm-documents

# SSL
ACME_EMAIL=admin@example.com
```

### 2. Container starten

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 3. Datenbank initialisieren

```bash
# Schema synchronisieren (NICHT migrate deploy!)
docker compose exec app node /prisma-cli/node_modules/prisma/build/index.js db push --skip-generate

# Seed-Daten laden (optional)
docker compose exec app bash -c "NODE_PATH=/prisma-cli/node_modules /prisma-cli/node_modules/.bin/tsx prisma/seed.ts"
```

### 4. Erster Login

Default-Superadmin: `admin@windparkmanager.de` / `admin123` (sofort aendern!)

---

## CI/CD Pipeline (GitHub Actions)

### CI Pipeline (`.github/workflows/ci.yml`)

```
Push/PR → main
  │
  ├── lint (10min)
  │   ├── npm ci
  │   ├── npx prisma generate
  │   ├── npm run lint
  │   └── npx tsc --noEmit
  │
  ├── build (15min, nach lint)
  │   ├── .env mit Dummy-Werten
  │   ├── npm run build
  │   └── Artifact Upload (.next/standalone, .next/static, public)
  │
  └── test (10min, optional, nach lint)
      └── npm run test (Vitest)
```

### Deploy Pipeline (`.github/workflows/deploy.yml`)

```
Push → main
  │
  ├── build-and-push (20min)
  │   ├── Docker Buildx Setup
  │   ├── Login ghcr.io
  │   ├── Tags: latest, SHA, Datum
  │   └── Push → ghcr.io/blubbiii/wka_verwaltung
  │
  └── deploy (optional, Template)
      ├── SSH → Server
      ├── docker compose pull
      └── docker compose up -d --no-deps
```

---

## Auth-Konfiguration (KRITISCH)

### trustHost

`trustHost: true` **MUSS** im Code stehen (NextAuthConfig), NICHT als Umgebungsvariable:

```typescript
// src/auth.config.ts
export const authConfig = {
  trustHost: true,  // Edge Middleware kann keine env vars lesen!
  // ...
}
```

### Cookies

```typescript
// HTTP (lokales Netzwerk):
cookies: { secure: false }

// HTTPS (Production mit SSL):
cookies: { secure: true }
```

Automatisch via `NEXTAUTH_URL.startsWith('https://')`.

### AUTH_SECRET vs NEXTAUTH_SECRET

NextAuth v5 verwendet `AUTH_SECRET`, aber fuer Rueckwaertskompatibilitaet **BEIDE** setzen:

```env
AUTH_SECRET=WindparkManager-Secret-Key-Mindestens-32-Zeichen-Lang
NEXTAUTH_SECRET=WindparkManager-Secret-Key-Mindestens-32-Zeichen-Lang
```

---

## Datenbank-Management

### WICHTIG: prisma db push (NICHT migrate deploy!)

Es existiert keine vollstaendige Migration-History. Schema-Aenderungen werden via `prisma db push` synchronisiert.

```bash
# Schema synchronisieren
docker compose exec app node /prisma-cli/node_modules/prisma/build/index.js db push --skip-generate

# NIEMALS:
# prisma db pull     → ueberschreibt schema.prisma komplett!
# prisma migrate dev → erstellt Migration die nicht zu deploy passt
```

### PostgreSQL Backup

**Automatisch** (via backup-Container):
- Taeglich: 02:00 (7 Tage Retention)
- Woechentlich: Sonntag 03:00 (4 Wochen Retention)
- Monatlich: 1. des Monats 04:00 (3 Monate Retention)
- Optional: S3-Upload

**Manuell:**
```bash
# Dump erstellen
docker compose exec -T postgres pg_dump -U wpm windparkmanager > backup.sql

# Dump importieren
docker compose exec -T postgres psql -U wpm windparkmanager < backup.sql
```

### PostgreSQL Passwort-Aenderung

**ACHTUNG:** PostgreSQL ignoriert `POSTGRES_PASSWORD` auf existierenden Volumes! Bei Passwort-Aenderung einen NEUEN Volume-Namen verwenden.

---

## Traefik Konfiguration

### Statisch (`traefik/traefik.yml`)

- Entry Points: web (80), websecure (443), traefik (8080)
- HTTP → HTTPS Redirect (permanent)
- Let's Encrypt ACME (HTTP Challenge)
- Docker Provider (Auto-Discovery via Labels)
- TLS 1.2+ mit starken Ciphern

### Dynamisch (`traefik/dynamic.yml`)

| Middleware | Beschreibung |
|-----------|--------------|
| security-headers | HSTS, X-Frame-Options, CSP |
| compress | Gzip/Brotli |
| rate-limit | 100/s avg, 200/s burst |
| rate-limit-api | 50/s avg, 100/s burst |
| circuit-breaker | >50% Fehler → Trip |
| body-limit | 10MB max Request |

---

## Monitoring & Health Checks

### Health Endpoints

```bash
# Application Health
curl -f https://wpm.example.com/api/health

# PostgreSQL
docker compose exec postgres pg_isready -U wpm

# Redis
docker compose exec redis redis-cli ping
```

### Docker Health Checks

Alle Services haben integrierte Health Checks:
- App: `/api/health` (30s Interval, 60s Startup)
- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`
- MinIO: `curl http://localhost:9000/minio/health/live`

### Logging

- **App**: Pino JSON-Logging (Slow-Query-Warnung >100ms)
- **Traefik**: JSON Access-Logs (200-299, 400-599)
- **Sentry**: Error-Tracking + Performance (Production only)

```bash
# Alle Logs
docker compose logs -f

# Nur App-Fehler
docker compose logs -f app 2>&1 | grep -i error
```

---

## Sicherheit

### Firewall (UFW)

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP → Redirect
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### Security Headers (next.config.ts + Traefik)

- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: 2 Jahre + Preload
- Content-Security-Policy: Restriktiv (self + Sentry)
- Permissions-Policy: Kamera/Mikro deaktiviert
- Referrer-Policy: strict-origin-when-cross-origin

### Rate Limiting

| Typ | Requests | Fenster |
|-----|----------|---------|
| Auth (Login, Reset) | 5 | 15 Min |
| File Upload | 20 | 1 Min |
| PDF Generation | 10 | 1 Min |
| General API | 100 | 1 Min |

### Container-Sicherheit

- Non-Root User (`nextjs:1001`)
- Minimal Alpine Base Image
- Health Checks integriert
- Resource Limits (Memory/CPU) in prod Compose
- PostgreSQL/Redis nicht extern exponiert

---

## Skalierung

### Worker-Replicas

```yaml
# docker-compose.prod.yml
services:
  worker:
    deploy:
      replicas: ${WORKER_REPLICAS:-2}
      resources:
        limits:
          memory: 512M
```

### Horizontale App-Skalierung

```yaml
services:
  app:
    deploy:
      replicas: 3
```

Voraussetzung: Redis fuer Session-/Permission-Cache (bereits implementiert).

---

## Troubleshooting

### "Cannot find module 'effect'"
→ Prisma CLI nicht korrekt isoliert. Pruefen: `/prisma-cli/node_modules/effect` muss existieren.

### Worker-Thread Error im Dev-Server
→ `serverExternalPackages: ['bullmq', 'ioredis', 'pino', 'pino-pretty']` in `next.config.ts` pruefen.

### PostgreSQL Passwort funktioniert nicht
→ Neuen Volume-Namen verwenden (PostgreSQL ignoriert Passwort-Aenderungen auf existierenden Volumes).

### Auth-Cookie funktioniert nicht
→ `trustHost: true` im Code (nicht env), Cookie `secure: false` fuer HTTP.

### Prisma Schema-Sync
→ `prisma db push` (NIEMALS `prisma db pull` oder `prisma migrate deploy`).

---

## Checkliste fuer Production

- [ ] Sichere Passwoerter fuer alle Services (NICHT die Defaults!)
- [ ] SSL/TLS via Traefik aktiviert
- [ ] Backups konfiguriert und getestet
- [ ] Monitoring eingerichtet (Sentry Token)
- [ ] Firewall konfiguriert (nur 22/80/443)
- [ ] E-Mail-Versand getestet
- [ ] Health Checks funktionieren
- [ ] Logging funktioniert
- [ ] Worker-Service laeuft (2+ Replicas)
- [ ] MinIO Bucket erstellt (wpm-documents)
- [ ] Default-Passwoerter geaendert

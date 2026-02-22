# WindparkManager

Verwaltungs- und Abrechnungsplattform für Windkraftanlagen mit Multi-Tenant-Architektur.

## Features

- Multi-Tenant System mit Admin-Bereich
- Park- und Turbinenverwaltung
- Beteiligungsverwaltung (Fonds & Gesellschafter)
- Pacht- und Grundstücksverwaltung
- Vertragsverwaltung mit Fristenwarnung
- Dokumentenmanagement mit Versionierung
- Abstimmungssystem
- Rechnungsstellung
- Audit-Log

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM
- **Datenbank**: PostgreSQL 16
- **Auth**: Auth.js (NextAuth v5)
- **Storage**: MinIO (S3-kompatibel)
- **Cache**: Redis

## Lokale Entwicklung

### Voraussetzungen

- Node.js 20+
- Docker Desktop (empfohlen) oder lokale PostgreSQL-Installation

### Option 1: Mit Docker (empfohlen)

```bash
# 1. Dependencies installieren
npm install

# 2. Docker-Container starten (PostgreSQL, Redis, MinIO, Mailhog)
docker compose -f docker-compose.dev.yml up -d

# 3. Prisma Client generieren
npx prisma generate

# 4. Datenbank migrieren
npx prisma db push

# 5. Testdaten einfügen
npx prisma db seed

# 6. Entwicklungsserver starten
npm run dev
```

### Option 2: Mit lokaler PostgreSQL

1. PostgreSQL installieren und Datenbank erstellen:
```sql
CREATE DATABASE windparkmanager;
CREATE USER wpm WITH PASSWORD 'devpassword';
GRANT ALL PRIVILEGES ON DATABASE windparkmanager TO wpm;
```

2. `.env.local` anpassen (falls andere Credentials):
```env
DATABASE_URL="postgresql://wpm:devpassword@localhost:5432/windparkmanager"
```

3. Fortfahren ab Schritt 3 von Option 1

### Anwendung starten

```bash
npm run dev
```

Die Anwendung ist unter http://localhost:3000 erreichbar.

### Test-Zugangsdaten

Nach dem Seeding stehen folgende Benutzer zur Verfügung:

| E-Mail | Passwort | Rolle |
|--------|----------|-------|
| admin@windparkmanager.de | admin123 | SUPERADMIN |
| manager@demo.de | demo123 | ADMIN |
| viewer@demo.de | demo123 | VIEWER |

## Projektstruktur

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Dashboard-Layout & Seiten
│   ├── api/                # API Routes
│   └── login/              # Login-Seite
├── components/             # React-Komponenten
│   ├── layout/             # Layout-Komponenten
│   └── ui/                 # shadcn/ui Komponenten
├── lib/                    # Hilfsfunktionen
│   ├── auth/               # Authentifizierung
│   └── prisma.ts           # Prisma Client
└── middleware.ts           # Auth Middleware

prisma/
├── schema.prisma           # Datenbank-Schema
└── seed.ts                 # Testdaten

docs/
├── requirements/           # Feature-Spezifikationen
├── architecture/           # System-Architektur
├── frontend/               # UI/UX-Konzept
├── devops/                 # Deployment-Anleitung
└── ROADMAP.md              # Entwicklungs-Roadmap
```

## Verfügbare Skripte

```bash
npm run dev          # Entwicklungsserver
npm run build        # Produktions-Build
npm run start        # Produktionsserver
npm run lint         # ESLint ausführen
```

## Prisma-Befehle

```bash
npx prisma generate   # Client generieren
npx prisma db push    # Schema synchronisieren (dev)
npx prisma migrate dev # Migration erstellen (dev)
npx prisma db seed    # Testdaten einfügen
npx prisma studio     # Datenbank-GUI
```

## Docker-Services (Entwicklung)

| Service | Port | Beschreibung |
|---------|------|--------------|
| PostgreSQL | 5432 | Datenbank |
| Redis | 6379 | Cache/Sessions |
| MinIO | 9000, 9001 | S3-kompatibler Storage |
| Mailhog | 1025, 8025 | E-Mail-Testing |

## Dokumentation

- [Feature-Spezifikationen](docs/requirements/feature-specifications.md)
- [System-Architektur](docs/architecture/system-architecture.md)
- [UI/UX-Konzept](docs/frontend/ui-ux-concept.md)
- [Deployment-Anleitung](docs/devops/deployment-guide.md)
- [Roadmap](docs/ROADMAP.md)

## Lizenz

Proprietär - Alle Rechte vorbehalten

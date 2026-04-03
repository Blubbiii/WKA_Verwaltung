# WindparkManager (WPM)

Verwaltungs-, Abrechnungs- und Analyseplattform für Windkraftanlagen mit Multi-Tenant-Architektur.

## Features

### Windparks & Anlagen
- Park- und Turbinenverwaltung mit Stammdaten und Notizen
- SCADA-Datenimport (Enercon WSD/UID) mit automatisierter n8n-Pipeline
- Service-Events, Wartungspläne und Checklisten
- Netzwerktopologie und Turbinenvergleiche

### GIS-Modul
- Leaflet-Karte mit Flurstücken, Kabeltrassen, Poolgebieten und Annotationen
- Zeichenwerkzeuge (Polygon, Linie, Punkt, Kreis) mit Undo/Redo
- Shapefile/ZIP-Import (Multi-Layer) mit QGIS-Roundtrip
- Layer-Management, Tile-Switching, Buffer-Zonen, Heatmap

### Finanzen & Buchhaltung
- Rechnungsstellung mit PDF-Generierung (DIN 5008), DATEV/GoBD-Export
- Consolidated Invoices, Gutschriften, Mahnwesen, SEPA-XML
- Vollständige Buchhaltung: SKR03, EÜR, GuV, BWA, UStVA, SuSa
- Angebote mit Status-Workflow (Entwurf → Rechnung)
- Bankimport (CSV), Multibanking, Liquiditätsplanung
- AfA-Verwaltung, Kassenbuch, Jahresabschluss
- Kostenstellen-Report und Budget Soll/Ist-Vergleich

### Beteiligungen & Gesellschaften
- Fund-Hierarchien (GbR, GmbH & Co. KG)
- Gesellschafter-Verwaltung mit Anteilen und Ausschüttungen
- Onboarding-Wizard für neue Gesellschafter
- Fund-spezifischer E-Mail-Versand mit eigenem SMTP

### Energiedaten
- Produktionsdaten, Netzbetreiber-Abrechnungen
- Marktwert-Vergleiche (SMARD/BnetzA API)
- Leistungskurven, Windrose, Tagesprofile
- Anomalie-Erkennung und Analytics

### Pacht & Grundstücke
- Pachtverträge mit Fristenwarnung
- Nutzungsentgelte, Vorschüsse, Abrechnungen
- Kostenverteilung und Zahlungsmanagement

### Verwaltung
- Dokumenten-Explorer mit Ordnerstruktur und ZIP-Download
- Kommunikationsmodul (Mailings an Gesellschafter)
- E-Mail-Vorlagen und Massenversand via BullMQ
- CRM mit Kontaktverwaltung

### Administration
- Multi-Tenant mit RBAC (Viewer, Manager, Admin, SuperAdmin)
- Feature-Flags (16 granulare Flags) für modulares Upselling
- System-Konfiguration (E-Mail, Storage, Wetter-API)
- Übersetzungs-Editor (3 Sprachen: DE Formell, DE Persönlich, EN)
- Audit-Log, Webhook-Management, Backup-Verwaltung

### UX & Design
- Persönliches Dashboard mit konfigurierbaren Widgets (12-Spalten Grid)
- Command Palette (Ctrl+K) für schnelle Navigation
- Framer Motion Animationen (Seitenübergänge, Listen, Erfolgs-Animationen)
- Personalisierte Begrüßung basierend auf Tageszeit
- Geführtes Onboarding (driver.js Tour in 3 Sprachen)
- Dark/Light Mode, Responsive Design

## Tech Stack

- **Frontend**: Next.js 16.2, React 19, Tailwind CSS 4.2, shadcn/ui (Radix v2)
- **Backend**: Next.js API Routes, Prisma 7.5 ORM
- **Datenbank**: PostgreSQL 16
- **Auth**: Auth.js (NextAuth v5) mit RBAC
- **Storage**: MinIO (S3-kompatibel)
- **Cache**: Redis
- **i18n**: next-intl 4.8 (DE Formell, DE Persönlich, EN)
- **GIS**: Leaflet 1.9, react-leaflet 5, leaflet-draw
- **Animationen**: Framer Motion 12
- **Queue**: BullMQ (E-Mail-Versand)
- **SCADA**: n8n Workflow + PowerShell Upload-Script

## Lokale Entwicklung

### Voraussetzungen

- Node.js 20+
- Docker Desktop (empfohlen) oder lokale PostgreSQL-Installation

### Schnellstart

```bash
# 1. Dependencies installieren
npm install

# 2. Docker-Container starten (PostgreSQL, Redis, MinIO, Mailhog)
docker compose -f docker-compose.dev.yml up -d

# 3. Prisma Client generieren
npx prisma generate

# 4. Datenbank synchronisieren
npx prisma db push

# 5. Testdaten einfügen
npx prisma db seed

# 6. Entwicklungsserver starten
npm run dev
```

Die Anwendung ist unter http://localhost:3000 erreichbar.

### Alternative: Lokale PostgreSQL

```sql
CREATE DATABASE windparkmanager;
CREATE USER wpm WITH PASSWORD 'devpassword';
GRANT ALL PRIVILEGES ON DATABASE windparkmanager TO wpm;
```

`.env.local` anpassen und ab Schritt 3 fortfahren.

### Test-Zugangsdaten

| E-Mail | Passwort | Rolle |
|--------|----------|-------|
| admin@windparkmanager.de | admin123 | SUPERADMIN |
| manager@demo.de | demo123 | ADMIN |
| viewer@demo.de | demo123 | VIEWER |

## Projektstruktur

```
src/
├── app/                        # Next.js App Router
│   ├── (dashboard)/            # Dashboard-Layout & alle Seiten
│   ├── api/                    # API Routes (~80+ Endpoints)
│   ├── login/                  # Login
│   └── register/               # Demo-Request Landing Page
├── components/                 # React-Komponenten
│   ├── admin/                  # Admin-UI (Config, Roles, etc.)
│   ├── dashboard/              # Dashboard-Widgets & Greeting
│   ├── invoices/               # Rechnungskomponenten
│   ├── layout/                 # Sidebar, Header
│   ├── maps/                   # GIS/Leaflet-Komponenten
│   ├── providers/              # Context Provider
│   └── ui/                     # shadcn/ui + Custom Components
├── hooks/                      # Custom React Hooks
├── i18n/                       # Internationalisierung (Config)
├── lib/                        # Utilities & Business Logic
│   ├── auth/                   # Auth & Permission Checks
│   ├── dashboard/              # Widget Registry & Layouts
│   ├── email/                  # E-Mail-Versand (SMTP, Queue)
│   ├── i18n/                   # Translation Loader
│   ├── onboarding/             # Tour-Definitionen
│   └── prisma.ts               # Prisma Client
├── messages/                   # i18n JSON-Dateien (de, de-personal, en)
├── styles/                     # Globale CSS-Styles
└── middleware.ts               # Auth & i18n Middleware

prisma/
├── schema.prisma               # Datenbank-Schema (~90 Models)
└── seed.ts                     # Testdaten
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
npx prisma db push    # Schema synchronisieren
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

## Deployment

Produktions-Deployment via Docker (Multi-Stage Build) auf internem Server mit Portainer.

- Image: `ghcr.io/blubbiii/wka_verwaltung:latest`
- Datenbank-Sync: `prisma db push` (keine Migration-Historie)
- SCADA-Pipeline: n8n Workflow + Windows Scheduled Task

## Lizenz

Proprietär - Alle Rechte vorbehalten

# Entwicklungs-Roadmap: WindparkManager (WPM)

## Status-Uebersicht

```
Phase 1          Phase 2          Phase 3          Phase 4          Phase 5          Phase 6
──────────────────────────────────────────────────────────────────────────────────────────────────────
FOUNDATION       CORE MODULES     ADVANCED         AUTOMATION       OPTIMIZATION     SCADA
✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG
──────────────────────────────────────────────────────────────────────────────────────────────────────
• Setup/Auth     • Parks/Anlagen  • Abstimmungen   • Auto-Billing   • Performance    • DBF-Import
• Multi-Tenant   • Beteiligungen  • Vollmachten    • E-Mail/Queue   • Dashboard 25W  • SCADA-Mapping
• Admin UI       • Pacht/Flaechen • Dokumente      • Wetter-API     • Security       • Anomalien
• Layout/Perms   • Rechnungen     • Vertraege      • BullMQ 8Q      • Testing/CI     • Analytics 8-Tab
• 75 Permissions • Portal         • Berichte/News  • Audit/Storage  • Monitoring     • Berichte
──────────────────────────────────────────────────────────────────────────────────────────────────────

Phase 7          Phase 8          Phase 9          Phase 10         Phase 11         Phase 12/13
──────────────────────────────────────────────────────────────────────────────────────────────────────
AUDIT & FIX      UX & WIZARDS     FINAL POLISH     SHP & KARTE      BF-ABRECHNUNG    VISUAL & INTEGR.
✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG
──────────────────────────────────────────────────────────────────────────────────────────────────────
• 43 Findings    • 5 Wizards      • Animations     • SHP-Import     • Cross-Tenant   • Brand Identity
• API-Auth       • Marketing CMS  • Glassmorphism   • Park-Karte     • Stakeholder    • CSS Variables
• Konsistenz     • Analytics Hub  • Permission Aud. • Polygone       • BF-Berechnung  • ICS-Export
• DATEV/Batch    • Berichte Hub   • Admin Konsol.   • Park-Zuordn.   • Feature-Flags  • Webhook-System
• Unit Tests     • Dashboard UX   • Duplikat-Clean  • Vertragspartn. • PDF/Rechnungen • Turbopack-Fix
──────────────────────────────────────────────────────────────────────────────────────────────────────

Phase 14                                    Phase 15
──────────────────────────────────────────────────────────────────────────────────────────────────────
KOMMUNIKATION & UX                          BUCHHALTUNGS-PAKET
✅ FERTIG                                   🔜 GEPLANT
──────────────────────────────────────────────────────────────────────────────────────────────────────
• Benachrichtigungscenter (U2)              • DATEV-Export Enhanced (SKR03)
• Serienbriefe / Mailing (K2)              • MT940/CAMT.054 Bank-Import
• Paperless-ngx Integration                • Mahnwesen UI + E-Mail-Versand
• Onboarding Product Tour (driver.js)      • SKR03 Kontenplan-Mapping
• Park-Wizard Vereinfachung                 • Cost-Center Reports (Park-P&L)
• Per-Turbine Pacht-Overrides              • Journal Entries (Manuell)
• Cookie-Einstellungen                      • Demo-Request /register
• Dashboard Footer                         • DATEV Enhanced (SKR03)
• Scrollbar-Theming
• Error-Detail-Surfacing
──────────────────────────────────────────────────────────────────────────────────────────────────────
```

---

## Technologie-Stack

| Kategorie | Technologie | Version |
|-----------|-------------|---------|
| Framework | Next.js (App Router, Turbopack) | 15.5 |
| Sprache | TypeScript | 5.x |
| UI | React, Tailwind CSS, shadcn/ui | 19.x |
| Datenbank | PostgreSQL + Prisma ORM | Prisma 6.x |
| Auth | NextAuth.js (JWT, Sessions) | 5.x |
| Queue | BullMQ + Redis (8 Queues, 8 Worker) | - |
| Storage | S3/MinIO (Presigned URLs) | - |
| E-Mail | SMTP/SendGrid/SES (Templates, Queue) | - |
| PDF | React-PDF (@react-pdf/renderer) | - |
| Karten | Leaflet + GeoJSON | - |
| Charts | Recharts (12 CSS-Variablen) | - |
| Monitoring | Pino Logger, Sentry | - |
| Testing | Vitest (Unit), Playwright (E2E) | - |
| CI/CD | GitHub Actions | - |
| Container | Docker, Traefik, Docker Compose | - |
| i18n | next-intl (DE/EN) | - |

---

## Projektstruktur

```
src/
├── app/
│   ├── (dashboard)/              # 107 Seiten (auth-geschuetzt)
│   │   ├── dashboard/            # Haupt-Dashboard mit Widget-Grid
│   │   ├── parks/                # Windpark-Verwaltung
│   │   ├── invoices/             # Rechnungswesen (3 Unter-Seiten)
│   │   ├── contracts/            # Vertragsmanagement + Kalender
│   │   ├── funds/                # Beteiligungen & Gesellschafter
│   │   ├── energy/               # Energie (Produktion, SCADA, Analytics, Settlements)
│   │   ├── leases/               # Pacht (Vertraege, Zahlungen, SHP-Import)
│   │   ├── documents/            # Dokumentenmanagement
│   │   ├── votes/                # Abstimmungssystem
│   │   ├── news/                 # News & Kommunikation
│   │   ├── reports/              # Berichte & Archiv
│   │   ├── service-events/       # Wartung & Service
│   │   ├── management-billing/   # BF-Abrechnung (Feature-Flag)
│   │   ├── settings/             # Benutzer-Einstellungen
│   │   └── admin/                # Administration (15+ Admin-Seiten)
│   │       ├── webhooks/         # Webhook-Verwaltung
│   │       ├── system-config/    # System-Konfiguration
│   │       ├── tenants/          # Mandanten-Verwaltung
│   │       └── ...               # Rollen, E-Mail, Backup, Audit, etc.
│   ├── api/                      # 286 Route Files (475 Endpoints)
│   │   ├── auth/                 # NextAuth Endpoints
│   │   ├── admin/                # Admin-APIs (94 Routes)
│   │   ├── energy/               # Energie/SCADA-APIs
│   │   ├── export/               # Export (CSV, Excel, DATEV, ICS)
│   │   ├── invoices/             # Rechnungs-APIs
│   │   ├── management-billing/   # BF-Abrechnungs-APIs (12 Routes)
│   │   ├── webhooks/             # Webhook-Endpunkte
│   │   └── ...                   # Parks, Funds, Leases, etc.
│   ├── (marketing)/              # Marketing-Seite (SSR, Admin-konfigurierbar)
│   └── (portal)/                 # Kommanditisten-Portal
│
├── components/
│   ├── layout/                   # Sidebar, Header, Breadcrumb
│   ├── dashboard/                # Dashboard-Grid, 27 Widgets
│   ├── maps/                     # Leaflet-Karten, GeoJSON-Layer
│   ├── management-billing/       # BF-Abrechnungs-Komponenten
│   └── ui/                       # shadcn/ui Basis-Komponenten
│
├── lib/
│   ├── auth/                     # Permission-System (75+ Permissions)
│   ├── queue/                    # BullMQ (8 Queues + 8 Worker)
│   ├── webhooks/                 # Webhook-Dispatcher + Events
│   ├── export/                   # CSV, Excel, DATEV, ICS-Generator
│   ├── email/                    # E-Mail-Provider + Templates
│   ├── pdf/                      # PDF-Generierung (DIN 5008)
│   ├── invoices/                 # Nummernkreise, Skonto, Korrektur
│   ├── einvoice/                 # XRechnung/ZUGFeRD
│   ├── scada/                    # DBF-Reader, Import, Anomalien
│   ├── shapefile/                # SHP-Parser, ALKIS-Mapping
│   ├── management-billing/       # Cross-Tenant BF-Service
│   ├── dashboard/                # Widget-Registry, Layouts
│   ├── reminders/                # Erinnerungs-Service
│   ├── archive/                  # GoBD-Archivierung
│   ├── billing/                  # Auto-Billing Rules
│   ├── cache/                    # Redis-Cache Layer
│   └── ...                       # Weather, Analytics, Config, etc.
│
├── hooks/                        # React Hooks (useFeatureFlags, etc.)
└── messages/                     # i18n (de.json, en.json)

prisma/
├── schema.prisma                 # 88 Datenbank-Models, 34 Enums
└── seed.ts                       # Seed-Daten + Permissions
```

---

## Modul-Abhaengigkeiten

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           FOUNDATION (Phase 1)                          │
│  Auth · Multi-Tenant · Permissions · Layout · Prisma · Redis · Docker  │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ (alles haengt von Foundation ab)
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                  ▼
┌──────────────────────┐ ┌───────────────┐ ┌──────────────────┐
│   CORE MODULES (P2)  │ │ AUTOMATION(P4)│ │ OPTIMIZATION (P5)│
│ Parks · Turbines     │ │ BullMQ Queues │ │ Dashboard Widgets│
│ Funds · Shareholders │ │ E-Mail System │ │ Redis Cache      │
│ Leases · Plots       │ │ PDF Generator │ │ Performance      │
│ Invoices · Portal    │ │ Audit-Log     │ │ Monitoring       │
│ Service-Events       │ │ File Storage  │ │ CI/CD · Testing  │
└──────────┬───────────┘ └──────┬────────┘ └────────┬─────────┘
           │                    │                    │
           ▼                    ▼                    │
┌──────────────────────┐ ┌──────────────────────┐    │
│  ADVANCED (Phase 3)  │ │   SCADA (Phase 6)    │    │
│ Abstimmungen/Proxies │ │ Enercon DBF-Import   │    │
│ Dokumente/Lifecycle  │ │ Turbine-Mapping      │    │
│ Vertraege/Fristen    │ │ Anomalie-Erkennung   │    │
│ Berichte/Export      │ │ Energy Analytics     │    │
│ News/Kommunikation   │ │ Portal-Analytics     │    │
└──────────┬───────────┘ └──────────┬───────────┘    │
           │                        │                 │
           ▼                        ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    ERWEITERUNGEN (Phase 7-13)                │
│                                                              │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ AUDIT & FIX (7) │  │ UX & WIZARDS (8) │  │ POLISH (9) │ │
│  │ 43 Findings     │  │ 5 Wizards        │  │ Animations │ │
│  │ Permission Fix  │  │ Marketing CMS    │  │ Admin Kons.│ │
│  │ Zod Validation  │  │ Analytics Hub    │  │ Cleanup    │ │
│  └────────┬────────┘  └────────┬─────────┘  └─────┬──────┘ │
│           │                    │                   │        │
│           ▼                    ▼                   ▼        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ SHP & KARTE(10) │  │ BF-BILLING (11)  │  │ VISUAL &   │ │
│  │ Shapefile-Import│  │ Cross-Tenant     │  │ INTEGR.(12)│ │
│  │ Park-Karte      │  │ Fee-Calculation  │  │ Brand Color│ │
│  │ Polygon-Layer   │  │ Feature-Flags    │  │ ICS Export │ │
│  │ Park-Zuordnung  │  │ Invoice-Pipeline │  │ Webhooks   │ │
│  └─────────────────┘  └──────────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Abhaengigkeiten im Detail

| Modul | Haengt ab von | Wird benoetigt fuer |
|-------|---------------|---------------------|
| **Auth/Permissions** | Prisma, NextAuth | Alle Module |
| **Multi-Tenancy** | Auth | Alle datenbankbasierten Module |
| **Parks & Turbines** | Foundation | SCADA, Energy, Leases, Contracts |
| **Funds & Shareholders** | Foundation | Invoices, Distributions, Portal, BF-Billing |
| **Invoices** | Funds, Parks | Distributions, E-Invoicing, DATEV, BF-Billing |
| **Leases & Plots** | Parks, Persons | SHP-Import, Park-Karte, Cost-Allocation |
| **Contracts** | Parks, Funds | ICS-Export, Reminders, Deadline-Widgets |
| **Documents** | Storage (S3/MinIO) | GoBD-Archiv, Lifecycle, Portal |
| **BullMQ Queues** | Redis | E-Mail, PDF, Billing, SCADA-Import, Webhooks, Weather, Reports, Reminders |
| **SCADA-Integration** | Parks, Turbines, BullMQ | Energy Analytics, Portal-Analytics, Anomalien |
| **Energy Settlements** | SCADA, Funds, Parks | Berichte, Analytics, BF-Billing (Basis-Revenue) |
| **Dashboard** | Alle Core-Module | - (Endpunkt, konsumiert Daten) |
| **Portal** | Funds, Shareholders | - (Endpunkt fuer Kommanditisten) |
| **Webhook-System** | BullMQ, Prisma | Externe Integrationen |
| **BF-Billing** | Funds, Parks, Invoices, Feature-Flags | Cross-Tenant Abrechnungen |
| **ICS-Export** | Contracts, Leases | Kalender-Integration (Outlook, Google) |
| **SHP-Import** | Leases, Plots, Persons | Park-Karte Polygone |
| **E-Invoicing** | Invoices | XRechnung/ZUGFeRD Compliance |
| **GoBD-Archiv** | Invoices, Documents | Betriebspruefungs-Export |
| **Notifications** | Reminder-Service, Auth | Bell-Icon, /notifications |
| **Mailings** | Shareholders, Funds, Email-Queue | Serienbriefe, Templates |
| **Paperless-ngx** | Feature-Flags, Documents, Config | Dokumenten-Archivierung |
| **Onboarding** | Auth, i18n | Interaktive Produktfuehrung |

---

## Abgeschlossene Phasen (1-13)

<details>
<summary><strong>Phase 1: Foundation</strong> ✅ — Setup, Auth, Multi-Tenancy, Admin, Layout, Permissions</summary>

- Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, ESLint
- PostgreSQL (Docker), Prisma ORM, Seed-Daten
- Docker-Setup (dev + prod), Traefik, MinIO, Redis
- NextAuth.js, Login, JWT, Passwort-Reset
- Multi-Tenancy (Tenant-Model, Middleware, tenantId)
- Admin (Mandanten-CRUD, User-Verwaltung, Impersonation)
- Layout (Sidebar, Header, Breadcrumb, Dark Mode, Toasts)
- 75 Permissions, 5 System-Rollen, checkPermission/requirePermission
</details>

<details>
<summary><strong>Phase 2: Core Modules</strong> ✅ — Parks, Anlagen, Beteiligungen, Pacht, Rechnungen, Portal</summary>

- Windparks (CRUD, Karte, Pacht-Config, Erloesphasen)
- Windkraftanlagen (CRUD pro Park, technische Daten, Status)
- Service-Events (Wartung, Reparatur, Inspektion, Kosten)
- Beteiligungen (Fonds, Gesellschafter, Quoten, Kapitaluebersicht)
- Ausschuettungen (Verteilung nach Quote, Status-Workflow)
- Kommanditisten-Portal (Dashboard, Beteiligungen, Dokumente, Berichte)
- Pacht & Flaechen (Fluerstuecke, Verpaecher, n:m Vertraege, Kalender)
- Rechnungswesen (Rechnungen + Gutschriften, Nummernkreise, MwSt, PDF)
- Admin-Einstellungen (Nummernkreise, Dokumentvorlagen, Briefpapier)
</details>

<details>
<summary><strong>Phase 3: Advanced Features</strong> ✅ — Abstimmungen, Vollmachten, Dokumente, Vertraege, Reports, News</summary>

- Abstimmungssystem (Zeitraum, Optionen, Quorum, PDF-Export)
- Vollmachten (General/Einzel, mit Vollmacht abstimmen)
- Dokumentenmanagement (Upload, Kategorien, Versionierung, Volltext-Suche)
- Vertragsmanagement (Typen, Fristen, Erinnerungen, Dashboard-Widget)
- Pacht-Abrechnungsperioden (Status-Workflow, Vorschuss, Jahresend)
- Reporting & Export (PDF, Excel, CSV, Monatsbericht, Jahresbericht)
- News & Kommunikation (Rich-Text, Kategorien, Fonds-spezifisch)
</details>

<details>
<summary><strong>Phase 4: Automation</strong> ✅ — PDF, Billing, E-Mail, Wetter, Jobs, Audit, Storage</summary>

- PDF-Generierung (Branding, DIN 5008, Wasserzeichen)
- Automatische Abrechnungen (BillingRule, Cron, Dry-Run)
- E-Mail-Benachrichtigungen (SMTP/SendGrid/SES, Templates, Queue)
- Wetter-Integration (OpenWeatherMap, Redis-Cache, Charts)
- Background Jobs (BullMQ, 8 Queues, 8 Worker, Retry, Dead Letter)
- Audit-Log (CRUD + Login/Export/Impersonate, Filter, Export)
- Datei-Storage (S3/MinIO, Presigned URLs, Speicherplatz-Tracking)
</details>

<details>
<summary><strong>Phase 5: Optimization</strong> ✅ — Dashboard, Sicherheit, UX, Performance, Monitoring, CI/CD</summary>

- Dashboard (25 Widgets, Drag & Drop, rollenbasierte Layouts, Redis-Cache)
- Sicherheit (AES-256-GCM Verschluesselung, Rate Limiting, Security Headers)
- Code-Qualitaet (React Query, formatCurrency, status-config, Loading States)
- Performance (N+1 Fixes, Composite Indexes, Bundle Size, Redis)
- Monitoring (Health-Check, Pino Logger, Sentry, Performance Metrics)
- Testing (Vitest Unit Tests, Playwright E2E Tests, GitHub Actions CI/CD)
- UX-Konsistenz (Action-Icons, Labels, Row-Click, Formular-Konsistenz)
- Admin-Struktur (Permission-basierte Sidebar, Settings, Keyboard-Shortcuts)
- DATEV-Export, Batch-Operations, i18n (DE/EN)
</details>

<details>
<summary><strong>Phase 6: SCADA-Integration</strong> ✅ — Import, Mapping, Analyse, Analytics, Portal, Berichte</summary>

- Enercon DBF-Import (WSD/UID/AVR/SSM, 10-Min-Intervalle, Auto-Import via BullMQ)
- SCADA-Mapping UI (Loc_xxxx+PlantNo → Park+Turbine)
- Anomalie-Erkennung (4 Algorithmen: Performance-Drop, Verfuegbarkeit, Kurven-Abweichung, Datenqualitaet)
- Netz-Topologie-Visualisierung (SVG-Canvas, Drag&Drop, Auto-Layout, Live-Status)
- Energy Analytics (8 Tabs: Performance, Verfuegbarkeit, Vergleich, Stoerungen, Umwelt, Finanzen, Daten-Explorer, Datenabgleich)
- Berichts-Konfigurator (22 Module, Portal-Sichtbarkeit)
- Portal Analytics Dashboard (KPIs, Trends, Turbinen-Tabelle)
</details>

<details>
<summary><strong>Phase 7: Audit & Stabilisierung</strong> ✅ — 43 Findings gefixt, 0 offen</summary>

- Kritisch: API-Auth, Permission-Enforcement, Password-Reset-Sicherheit
- Hoch: requirePermission auf allen Routes, Sidebar-Navigation, Role-Hierarchie
- Mittel: Zod-Validierung, Lease-Prorating, Upload-Fortschritt, Console.log Cleanup
- Business: DATEV-Export, Audit-Log Filter, Batch-Operations, Shortcuts
- Qualitaet: Unit Tests, CI/CD Pipeline, DB-Backups, Report-Templates
</details>

<details>
<summary><strong>Phase 8: UX-Optimierung & Workflow-Wizards</strong> ✅ — Marketing CMS, 5 Wizards, Analytics-Konsolidierung, Dashboard-UX</summary>

- Marketing-Seite: Admin-konfigurierbarer Content (Hero, Features, Preisrechner, CTA)
- Marketing-Admin-UI (4 Tabs mit Live-Vorschau)
- Dynamische Legal-Pages (Impressum, Datenschutz, AGB ueber Admin)
- 5 Workflow-Wizards:
  - Jahresendabrechnung-Wizard (Park → Zeitraum → Datenquellen → Zusammenfassung → Erstellen)
  - Park-Einrichtungs-Wizard (Stammdaten → Turbinen → SCADA-Mapping → Topologie → Freigabe)
  - Pachtabrechnung-Wizard (Pachtvertrag → Zeitraum → Kosten → Vorschau → Erstellen)
  - Vertrags-Wizard (Vertragstyp → Parteien → Konditionen → Dokumente → Freigabe)
  - Tenant-Onboarding-Wizard (Mandant → Admin-User → Einstellungen → Datenimport → Freigabe)
- Dashboard-Widget-Sizing + Sidebar-Logo (Tenant-Logo via Session-Flow)
- Analysen/Reports-Konsolidierung (10+ Seiten → 3 Seiten)
</details>

<details>
<summary><strong>Phase 9: Final Polish & Hardening</strong> ✅ — UI/UX, Permission-Audit, Duplikat-Cleanup, Admin-Konsolidierung</summary>

**UI/UX Design-System Polish:**
- Tailwind Animations: shimmer, fade-in, slide-in-right, scale-in, ease-out-expo
- Glassmorphism Header, Button Micro-Interactions, Skeleton Shimmer
- Table Zebra-Striping, Toast Animations, Sidebar Active-Indicator
- Stats-Cards Gradient, Page-Header Divider, Empty-State Animation
- CSS-Klassen: .card-interactive, .glass, .animate-shimmer
- Badge success/warning Varianten

**Permission-Audit & Security Hardening:**
- 3 neue Permissions: admin:manage, energy:scada:import, energy:settlements:finalize
- 9 API-Routes gefixt, Resource-Level-Filtering, SuperAdmin-Schutz

**Duplikat-Cleanup & Admin-Konsolidierung:**
- 4 redundante Seiten entfernt
- Admin-Settings 12 → 3 Tabs, 4 neue fokussierte Admin-Pages
</details>

<details>
<summary><strong>Phase 10: SHP-Import, Fluerstuecks-Karte & Pachtvertrags-Erweiterungen</strong> ✅</summary>

**Shapefile (SHP) Import-System:**
- SHP-Parser (`shpjs`): ZIP/Einzeldatei → GeoJSON
- ALKIS-Auto-Detection: 9 Plot-Felder + 8 Eigentuemer-Felder
- Multi-Owner-Erkennung (Semikolon-Trenner, Erbengemeinschaft/GbR)
- Preview + Confirm API mit Deduplizierung
- 5-Schritt Import-Wizard (/leases/import-shp)

**Park-Karte mit Fluerstuecks-Polygonen:**
- GeoJSON-Polygone farbcodiert nach Eigentuemer
- Vertragsstatus-Visualisierung (Aktiv/Entwurf/Ohne Vertrag/Abgelaufen)
- MapLayerControl: Layer-Toggles + Eigentuemer-Legende + Status-Legende
- Polygon-Popup mit Fluerstueck-Details

**Park-Zuordnung:**
- Inline Park-Selector im Lease-Edit
- Fluerstuecke-Tab auf Park-Detailseite
- "Fluerstuecke zuordnen" + "Vertrag zuordnen" Dialoge

**Pachtvertrags-Erweiterungen:**
- Vertragspartner-Feld (contractPartnerFundId)
- PersonEditDialog: Inline-Bearbeitung von Verpaechter-Daten
</details>

<details>
<summary><strong>Phase 11: Betriebsfuehrungs-Abrechnung (BF-Billing)</strong> ✅ — Cross-Tenant Stakeholder, Berechnung, Rechnungen, Feature-Flags</summary>

**Datenmodell:**
- `ParkStakeholder`: Cross-Tenant Verknuepfung (BF-Firma → Park → Rolle + Gebuehr)
- `StakeholderFeeHistory`: Historische Gebuehren mit Gueltigkeitszeitraum
- `ManagementBilling`: Abrechnung pro Stakeholder/Periode (DRAFT → CALCULATED → INVOICED)

**Cross-Tenant Service:**
- Sicherer Zugriff auf fremde Mandanten-Daten
- Fee-Resolution mit History-Fallback
- Kern-Berechnung (baseRevenue × feePercentage, MwSt)

**API + UI:**
- 12 Endpoints, 7 UI-Seiten, 6 Komponenten
- 6 neue Permissions: management-billing:read/create/update/delete/calculate/invoice
- Rechnungsintegration mit bestehender Invoice-Pipeline + PDF

**Feature-Flag-System (pro Mandant):**
- Superadmin + Mandanten-Admin Toggles
- Sidebar: Items mit `featureFlag` automatisch ausgeblendet
- `/api/features` Endpoint + `useFeatureFlags` Hook
</details>

<details>
<summary><strong>Phase 12: Visual Overhaul & Brand Identity</strong> ✅ — Warm Navy Design, CSS-Variablen, Marketing-Redesign</summary>

**Brand Identity (Warm Navy #335E99):**
- Primaerfarbe von Blau (#3b82f6) auf Warm Navy (#335E99) umgestellt
- 44 Dateien aktualisiert: E-Mail-Templates, PDF-Templates, Charts, Maps, Settings
- Domain-spezifische Farben beibehalten (Topologie-Spannungsebenen, Eigentuemer-Palette)

**CSS-Variablen-Zentralisierung:**
- 12 Chart-Variablen (`--chart-1` bis `--chart-12`) in `globals.css`
- Alle Recharts-Komponenten nutzen `hsl(var(--chart-N))` statt hardcoded Hex
- Light + Dark Mode Farben zentral definiert

**Marketing-Seite Redesign:**
- "Precision Engineering" Aesthetik
- Dashboard-Vorschau, Feature-Grid, Social Proof
- Responsive Design, Dark Mode Support

**Sidebar Dark Mode:**
- Hintergrundfarbe auf Brand-Navy abgestimmt
</details>

<details>
<summary><strong>Phase 13: Integrationen</strong> ✅ — Worker-Thread-Fix, ICS-Kalenderexport, Webhook-System</summary>

**Worker-Thread-Fix (Turbopack-Kompatibilitaet):**
- `serverExternalPackages: ["bullmq", "ioredis", "pino", "pino-pretty"]` in next.config.ts
- Behebt `Cannot find module '.next\server\vendor-chunks\lib\worker.js'` Error-Spam
- BullMQ-Worker laufen jetzt fehlerfrei im Dev-Server

**ICS-Kalenderexport (RFC 5545):**
- `GET /api/export/calendar?type=contracts|leases|all&status=ACTIVE&fundId=X&parkId=Y`
- RFC 5545 Generator ohne externe Abhaengigkeiten (~100 Zeilen)
- Pro Vertrag: Endtermin-Event + Kuendigungsfrist-Event + VALARM aus reminderDays[]
- Pro Pachtvertrag: Endtermin-Event
- Export-Button auf der Vertrags-Kalender-Seite
- Importierbar in Outlook, Google Calendar, Apple Calendar

**Webhook-System (Event-Driven HTTP Callbacks):**
- 2 neue Prisma-Models: `Webhook` + `WebhookDelivery`
- 13 Event-Typen in 6 Kategorien:
  - Rechnungen: invoice.created, invoice.sent, invoice.paid, invoice.overdue
  - Vertraege: contract.expiring, contract.expired
  - Abrechnungen: settlement.created, settlement.finalized
  - Abstimmungen: vote.created, vote.closed
  - Dokumente: document.uploaded, document.approved
  - Service-Events: service_event.created
- Dispatcher: Fire-and-forget `dispatchWebhook(tenantId, event, data)`
- BullMQ-Queue: 3 Retries, exponentieller Backoff (10s → 20s → 40s)
- Worker: HMAC-SHA256 Signatur, 5s Timeout, Delivery-Log in DB
- 4 Admin-API-Routes: CRUD, Test-Event, Delivery-Log (paginiert)
- Admin-UI (`/admin/webhooks`): Tabelle, Create/Edit, Event-Checkboxes, Delivery-Log, Test-Button
- Integration in 6 bestehende Routes (non-blocking, fehlertolerant)
</details>

<details>
<summary><strong>Phase 14: Kommunikation & UX</strong> ✅ — Benachrichtigungen, Serienbriefe, Paperless, Onboarding, Park-Verbesserungen</summary>

**U2: Benachrichtigungs-Center:**
- Notification Model (5 Typen: DOCUMENT, VOTE, CONTRACT, INVOICE, SYSTEM)
- 4 API-Routes (Liste, Unread-Count, Mark-Read, Mark-All-Read)
- Bell-Icon im Header mit Badge + Popover (15 neueste)
- Vollstaendige `/notifications`-Seite mit Typ-Filter + Paginierung
- Shared UI-Utilities (`notification-ui.ts`: Icons, Farben, Labels, Relative Time)
- Reminder-Service Integration (erzeugt Notifications bei Faelligkeiten)

**K2: Serienbriefe / Mailing:**
- 3 neue Prisma-Models: `MailingTemplate`, `Mailing`, `MailingRecipient`
- 2 Enums: `MailingCategory` (6 Werte), `MailingStatus` (5 Werte)
- 6 API-Routes: Templates CRUD, Mailings CRUD, Send, Preview
- Platzhalter-Service mit 8 Standard-Platzhaltern
- 3-Schritt Wizard: Template → Empfaenger → Vorschau+Senden
- Template-Editor mit Rich-Text + Platzhalter-Insert
- BullMQ-Integration fuer Massenversand
- Sidebar: "Serienbriefe" mit Children "Uebersicht" + "Vorlagen"

**Paperless-ngx Integration:**
- Feature-Flag-gesteuertes Addon fuer Dokumenten-Archivierung
- API-Client + 7 API-Routes (Dokumente, Metadaten, Sync)
- Browser-Seite, Sync-Button, Auto-Archive Hooks
- Config-Form in System-Einstellungen (verschluesselt)

**Onboarding Product Tour:**
- driver.js Integration mit rollenbasierten Steps
- Tour-State-Persistence via API, Auto-Trigger fuer neue Benutzer
- Custom-Theme, i18n-Support (DE/EN)

**Park & Turbinen Verbesserungen:**
- Park-Wizard von 3 auf 2 Schritte vereinfacht
- Feld-Name-Fix: Unicode ue → ASCII ue in allen APIs
- Per-Turbine Pacht-Overrides: 3 Felder (minimumRent, weaSharePercentage, poolSharePercentage)
- Tooltip-Hinweise an Override-Feldern
- Beide Calculatoren (lease-revenue + settlement) nutzen Per-Turbine-Werte

**Sonstiges:**
- Cookie-Einstellungen-Seite + Legal Pages erweitert
- Dashboard Footer (Version, Copyright, Legal Links)
- Scrollbar-Theming (Dark/Light Mode)
- Error-Detail-Surfacing fuer System-Config API
</details>

---

## Meilensteine

| # | Beschreibung | Status |
|---|-------------|--------|
| M1 | Foundation: Login, Admin, Mandanten, Basis-UI | ✅ |
| M2 | Core: Parks, Anlagen, Beteiligungen, Pacht | ✅ |
| M3 | Portal: Kommanditisten-Portal | ✅ |
| M4 | Rechnungswesen: Invoicing mit PDF | ✅ |
| M5 | Advanced: Abstimmungen, Dokumente, Vertraege | ✅ |
| M6 | Automation: Billing, E-Mails, Wetter, 8 BullMQ-Queues | ✅ |
| M7 | Dashboard: 25 Widgets, Drag & Drop, Redis-Cache | ✅ |
| M8 | Security Hardening + UX-Konsistenz | ✅ |
| M9 | Monitoring: Sentry, Pino, Metrics | ✅ |
| M10 | SCADA: Enercon-Import, Mapping, Anomalie-Erkennung | ✅ |
| M11 | Energy Analytics: 8-Tab Dashboard, Portal, Berichte | ✅ |
| M12 | Stabilisierung: Permissions, Validierung, Backups | ✅ |
| M13 | Business-Features: DATEV, Audit-Filter, Batch-Ops | ✅ |
| M14 | Testing & CI/CD: Vitest, Playwright, GitHub Actions | ✅ |
| M15 | i18n (DE/EN), Storage-Tracking, Dashboard-Caching | ✅ |
| M16 | Billing-Worker, E-Invoicing (XRechnung/ZUGFeRD), Mahnwesen | ✅ |
| M17 | Workflow-Automation + Benachrichtigungen | ✅ |
| M18 | Marketing CMS + Admin-konfigurierbar | ✅ |
| M19 | 5 Workflow-Wizards (Settlement, Park, Lease, Contract, Tenant) | ✅ |
| M20 | Dashboard-UX + Sidebar-Logo + Widget-Sizing | ✅ |
| M21 | Analysen/Reports-Konsolidierung (10+ → 3 Seiten) | ✅ |
| M22 | UI/UX Design-System (Animations, Glassmorphism, Micro-Interactions) | ✅ |
| M23 | Permission-Audit & Security Hardening (9 Routes, 3 Permissions) | ✅ |
| M24 | Duplikat-Cleanup (4 Seiten entfernt) | ✅ |
| M25 | Admin-Konsolidierung (12-Tab → 5 fokussierte Pages) | ✅ |
| M26 | SHP-Import: Parser, ALKIS-Mapping, 5-Schritt-Wizard | ✅ |
| M27 | Park-Karte: GeoJSON-Polygone, Eigentuemer-Farben, Layer-Controls | ✅ |
| M28 | Park-Zuordnung: Fluerstuecke + Vertraege zuweisen | ✅ |
| M29 | Vertragspartner-Feld + PersonEditDialog | ✅ |
| M30 | BF-Abrechnung: Cross-Tenant Stakeholder, Berechnung, Rechnungen | ✅ |
| M31 | Feature-Flag-System: Pro-Mandant Toggles, Sidebar-Integration | ✅ |
| M32 | Visual Overhaul: Warm Navy Brand, CSS-Variablen, Marketing-Redesign | ✅ |
| M33 | ICS-Kalenderexport: RFC 5545, Vertragsfristen + Pachttermine | ✅ |
| M34 | Webhook-System: 13 Events, HMAC-SHA256, Admin-UI, BullMQ-Worker | ✅ |
| M35 | Worker-Thread-Fix: Turbopack + BullMQ Kompatibilitaet | ✅ |
| M36 | Benachrichtigungs-Center: Bell-Icon, /notifications, Reminder-Integration | ✅ |
| M37 | Serienbriefe: 3 Models, Platzhalter-Service, 3-Schritt Wizard, 6 API-Routes | ✅ |
| M38 | Paperless-ngx: Feature-Flag Addon, 7 API-Routes, Sync-Worker | ✅ |
| M39 | Onboarding Tour: driver.js, rollenbasierte Steps, Auto-Trigger | ✅ |
| M40 | Park-Wizard Vereinfachung + ü/ue Feld-Fix + Per-Turbine Pacht-Overrides | ✅ |
| M41 | Cookie-Einstellungen, Dashboard Footer, Scrollbar-Theming | ✅ |
| M43 | Demo-Request /register Seite + /api/demo-request Endpoint | ✅ |
| M44 | DATEV-Export Enhanced: Buchungssaetze mit SKR03-Kontonummern | 🔜 |
| M46 | MT940/CAMT.054 Bank-Import + automatisches Payment-Matching | 🔜 |
| M47 | Mahnwesen UI: PDF-Mahnung, direkter E-Mail-Versand, Mahnstufen-Verwaltung | 🔜 |
| M48 | SKR03 Kontenplan-Mapping (konfigurierbar je Mandant) | 🔜 |
| M49 | Cost-Center Reports: Park-P&L, Einnahmen vs. Ausgaben, XLSX-Export | 🔜 |
| M50 | Journal Entries: Manuelle Soll/Haben-Buchungen mit SKR03 | 🔜 |
| M42 | Release: Production Deployment | ⏳ |

---

## Feature-Status (Komplett-Uebersicht)

### Kernmodule

| Kategorie | Umfang | Status |
|-----------|--------|--------|
| Auth & Authorization | NextAuth, JWT, 75+ Permissions, 5 Rollen, Resource-Access | ✅ 100% |
| Multi-Tenancy | Tenant-Isolation, Cross-Tenant (BF), Impersonation | ✅ 100% |
| Parks & Turbines | CRUD, Karte, Erloesphasen, Topologie, MaStR | ✅ 100% |
| Funds & Shareholders | CRUD, Quoten, Kapital, Hierarchie, Onboarding-Wizard | ✅ 100% |
| Leases & Plots | CRUD, n:m, Kalender, Cost-Allocation, SHP-Import | ✅ 100% |
| Contracts | CRUD, Fristen, Erinnerungen, ICS-Export, Kalender-View | ✅ 100% |
| Invoices | CRUD, PDF, Gutschriften, Skonto, Teilstorno, Mahnwesen | ✅ 100% |
| Documents | Upload, Versionen, Lifecycle, Volltext-Suche, GoBD-Archiv | ✅ 100% |
| Voting + Proxies | Zeitraum, Optionen, Quorum, PDF-Export, Vollmachten | ✅ 100% |
| Service Events | Wartung, Reparatur, Inspektion, Kosten-Tracking | ✅ 100% |
| News | Rich-Text, Kategorien, Fonds-spezifisch | ✅ 100% |
| Distributions | Verteilung nach Quote, Status-Workflow | ✅ 100% |

### Energie & SCADA

| Kategorie | Umfang | Status |
|-----------|--------|--------|
| SCADA-Import | Enercon DBF (WSD/UID/AVR/SSM), Auto-Import via BullMQ | ✅ 100% |
| SCADA-Mapping | Loc_xxxx+PlantNo → Park+Turbine, Admin-UI | ✅ 100% |
| Anomalie-Erkennung | 4 Algorithmen, konfigurierbare Schwellwerte | ✅ 100% |
| Energy Analytics | 8-Tab Hub (Performance bis Datenabgleich) | ✅ 100% |
| Energy Settlements | Netzbetreiber/Direktvermarkter, Status-Workflow | ✅ 100% |
| Netz-Topologie | SVG-Canvas, Drag&Drop, Live-Status-Farben | ✅ 100% |
| Portal-Analytics | KPIs, YoY-Chart, Turbinen-Tabelle | ✅ 100% |

### Rechnungswesen (erweitert)

| Kategorie | Umfang | Status |
|-----------|--------|--------|
| PDF-Generierung | DIN 5008, Branding, Wasserzeichen, Briefpapier | ✅ 100% |
| E-Invoicing | XRechnung (UBL 2.1), ZUGFeRD 2.2 COMFORT, Validator | ✅ 100% |
| Wiederkehrende Rechnungen | RecurringInvoice Model, Frequenz-Scheduling | ✅ 100% |
| Abschlagsrechnungen | Pacht-Vorschuss, monatliche Auto-Generierung | ✅ 100% |
| WYSIWYG-Editor | 15 Block-Typen, Drag&Drop, Live-Vorschau, Merge-Vars | ✅ 100% |
| GoBD-Archivierung | SHA-256 Hash-Chain, 10-Jahre Retention, Audit-Export | ✅ 100% |
| DATEV-Export | Standard-Buchungsformat | ✅ 100% |
| Nummernkreise | {YEAR}/{NUMBER}, fuehrende Nullen, pro Typ | ✅ 100% |
| Mahnwesen | 3 Stufen + Verzugsgebuehren im Billing-Worker | ✅ 100% |

### Automation & Infrastruktur

| Kategorie | Umfang | Status |
|-----------|--------|--------|
| BullMQ Queue-System | 8 Queues + 8 Worker (Email, PDF, Billing, Weather, Report, Reminder, SCADA, Webhook) | ✅ 100% |
| E-Mail-System | SMTP/SendGrid/SES, Templates, Queue, Massen-Kommunikation | ✅ 100% |
| Wetter-Integration | OpenWeatherMap, Redis-Cache, Charts | ✅ 100% |
| Audit-Log | CRUD + Login/Export/Impersonate, Filter, CSV-Export | ✅ 100% |
| File Storage | S3/MinIO, Presigned URLs, Speicherplatz-Tracking | ✅ 100% |
| Auto-Billing | BillingRules, Cron, Dry-Run, 5 Prozessoren | ✅ 100% |
| Erinnerungen | 4 Kategorien (Rechnungen, Vertraege, Settlements, Dokumente) | ✅ 100% |
| Geplante Berichte | ScheduledReport, Cron, E-Mail-Versand | ✅ 100% |

### Kommunikation & Benachrichtigungen

| Kategorie | Umfang | Status |
|-----------|--------|--------|
| Benachrichtigungs-Center | Bell-Icon, Popover, /notifications, 5 Typen, Reminder-Integration | ✅ 100% |
| Serienbriefe (Mailing) | 3 Models, Platzhalter-Service, 3-Schritt Wizard, Template-Editor | ✅ 100% |
| Massen-E-Mail | Ad-hoc Massen-E-Mails, BullMQ-Queue, 5 concurrent, 100/min | ✅ 100% |

### Integrationen & Export

| Kategorie | Umfang | Status |
|-----------|--------|--------|
| ICS-Kalenderexport | RFC 5545, Vertragsfristen + Pachttermine, VALARM | ✅ 100% |
| Webhook-System | 13 Events, HMAC-SHA256, BullMQ, Admin-UI, Delivery-Log | ✅ 100% |
| CSV/Excel-Export | Alle Entitaeten exportierbar | ✅ 100% |
| SHP-Import | Shapefile → Fluerstuecke + Eigentuemer + Vertraege | ✅ 100% |
| Paperless-ngx | Feature-Flag Addon, 7 API-Routes, Sync-Worker, Auto-Archive | ✅ 100% |

### UI/UX & Design

| Kategorie | Umfang | Status |
|-----------|--------|--------|
| Dashboard | 27 Widgets, 12-Column Grid, 4 Rollen-Layouts, Drag&Drop | ✅ 100% |
| Brand Identity | Warm Navy (#335E99), CSS-Variablen, konsistente Farbgebung | ✅ 100% |
| Design-System | Animations, Glassmorphism, Micro-Interactions, Dark Mode | ✅ 100% |
| 5 Workflow-Wizards | Settlement, Park (2-Step), Lease, Contract, Tenant | ✅ 100% |
| Marketing CMS | Admin-konfigurierbar (Hero, Features, Preisrechner, CTA) | ✅ 100% |
| i18n | Deutsch + Englisch (next-intl, Cookie-basiert) | ✅ 100% |
| Kommanditisten-Portal | Dashboard, Beteiligungen, Dokumente, Berichte, Analytics | ✅ 100% |
| Onboarding Tour | driver.js, rollenbasierte Steps, Auto-Trigger, i18n | ✅ 100% |
| Dashboard Footer | Version, Copyright, Legal Links (Impressum, Datenschutz, Cookies) | ✅ 100% |
| Cookie-Einstellungen | Cookie-Settings-Seite, Legal Pages erweitert | ✅ 100% |

### Betriebsfuehrung & Cross-Tenant

| Kategorie | Umfang | Status |
|-----------|--------|--------|
| BF-Abrechnung | Cross-Tenant Stakeholder, Fee-Calculation, Invoicing | ✅ 100% |
| Feature-Flag-System | Pro-Mandant Toggles, Sidebar-Integration, API-Gating | ✅ 100% |

### Sicherheit & Qualitaet

| Kategorie | Umfang | Status |
|-----------|--------|--------|
| Verschluesselung | AES-256-GCM fuer sensible Daten | ✅ 100% |
| Rate Limiting | API-Schutz gegen Missbrauch | ✅ 100% |
| Security Headers | CSP, HSTS, X-Frame-Options | ✅ 100% |
| Monitoring | Pino Logger, Sentry, Health-Check, Metrics | ✅ 100% |
| Testing | Vitest (Unit, 35+ Cases), Playwright (E2E, 20+ Specs) | ✅ 100% |
| CI/CD | GitHub Actions Pipeline | ✅ 100% |
| Docker | Dev + Prod Compose, Traefik Reverse-Proxy | ✅ 100% |

---

## Kennzahlen

| Metrik | Wert |
|--------|------|
| Seiten (Pages) | 132 (112 Dashboard + 12 Portal + 8 Auth/Marketing) |
| API Route Files | 299 (490+ HTTP-Endpoints) |
| Prisma-Models | 91 (+MailingTemplate, Mailing, MailingRecipient) |
| Prisma-Enums | 36 (+MailingCategory, MailingStatus) |
| Relations | 230+ |
| Components | 170+ in 24 Verzeichnissen |
| BullMQ Queues + Worker | 8 + 8 |
| Dashboard-Widgets | 27 (12 KPI, 6 Chart, 5 List, 2 Utility, 4 Admin) |
| Sidebar-Navigation Items | 38+ in 7 Gruppen |
| Permissions | 79 in 16 Kategorien (+mailings) |
| System-Rollen | 6 (SUPERADMIN → PORTAL) |
| Webhook-Event-Typen | 13 in 6 Kategorien |
| Workflow-Wizards | 5 (+Mailing-Wizard) |
| i18n-Sprachen | 2 (DE/EN) |
| E-Mail-Templates | 14+ |
| PDF-Templates | 5+ |
| Chart CSS-Variablen | 12 |
| Cache Prefixes | 8 |
| Security Headers | 9 |
| Rate Limit Presets | 4 |

---

## Offene Punkte

### Phase 15: Buchhaltungs-Paket

Statt ERPNext zu integrieren, bauen wir die relevanten Buchhaltungsfunktionen
nativ in WPM — eine Datenbank, kein externer Stack, direkt vermarktbar.

**Strategische Grundlage:**
ERPNext wurde evaluiert und abgelehnt (Datenbankkonflikt, zu komplex).
Ideen werden nativ in WPM implementiert. Inspirationsquellen unten.

---

#### Tier 1 — Hoher Wert, ~4–6 Wochen:

- [ ] **DATEV-Export Enhanced** — Buchungssätze mit echten SKR03-Kontonummern, GoBD-konform
  - Steuerberater bekommt fertige DATEV-Datei statt Rohdaten
  - **Inspiration:** [Kivitendo](https://github.com/kivitendo/kivitendo-erp) — deutscher Open-Source-ERP,
    DATEV-Export seit 2003, SKR03 direkt im Source Code studieren (Perl, aber Logik übertragbar)
  - **Inspiration:** Odoo `l10n_de` Modul — SKR03/SKR04 Kontenplan-Struktur
  - DATEV-Format: Buchungstext, Kontonummer (4-stellig), Gegenkonto, Betrag, Datum, Belegnummer

- [ ] **MT940/CAMT.054 Bank-Import** — Kontoauszug hochladen → automatisches Payment-Matching
  - Zahlungseingang → Invoice Status `PAID` automatisch, kein manuelles Abgleichen
  - **NPM-Paket direkt nutzen:** `npm install mt940js` — parst MT940 → JS-Objekte, kein Parser nötig!
  - **CAMT.054:** Reines XML → standard Node.js XML-Parser reicht
  - **UI-Inspiration:** [InvoiceNinja Banking](https://invoiceninja.github.io/en/banking/) —
    Matched vs. Unmatched Transactions UI, Fuzzy-Matching auf Betrag + Datum + Referenz
  - Matching-Logik: Betrag exakt + IBAN oder Verwendungszweck enthält Rechnungsnummer

- [ ] **Mahnwesen UI + E-Mail-Versand** — Mahnstufen-Verwaltung, PDF-Mahnschreiben, direkter E-Mail-Versand
  - Vollständiger Dunning-Workflow ohne externe Tools
  - **UI-Inspiration:** [InvoiceNinja Reminders](https://invoiceninja.com/invoicing/) —
    3 Stufen (First/Second/Third + Endless), Tage vor/nach Fälligkeit konfigurierbar
  - **Design-Inspiration:** [Crater](https://github.com/crater-invoice-inc/crater) — cleane Stage-Cards
  - WPM-Umsetzung: BullMQ-Cron prüft täglich, erzeugt DunningNotice Model, PDF + E-Mail-Queue
  - 3 Stufen: Zahlungserinnerung (0€ Gebühr) → 1. Mahnung (5€) → 2. Mahnung (15€ + Verzugszins)

- [ ] **SKR03 Kontenplan-Mapping** — WPM-Transaktionen erhalten echte Kontonummern
  - Pacht→4210, Einspeisung→8400, AfA→4830 (konfigurierbar je Mandant)
  - **Quelle:** [Kivitendo SKR03](https://github.com/kivitendo/kivitendo-erp) Source + DATEV-Offizial-Doku
  - Relevante WPM-Konten: Einspeisung 8400, Direktvermarktung 8338, Pachtaufwand 4210,
    Wartung/Service 4950, Abschreibung 4830, Verwaltung BF 4120, Vorsteuer 1576, MwSt 1776

---

#### Tier 2 — Mittlerer Wert, ~6–8 Wochen nach Tier 1:

- [ ] **Cost-Center Reports (Park-P&L)** — Einnahmen vs. Ausgaben je Park, exportierbar als XLSX
  - Windpark-Controller brauchen das täglich
  - **Inspiration:** [hledger](https://hledger.org/) — Web-UI + JSON-API für Cost-Center-Reports,
    Einnahmen/Ausgaben-Struktur je Periode und Kostenstelle
  - WPM: Jeder Park = Cost Center, Buchungen aus Settlements + Invoices + Service-Events

- [ ] **Journal Entries (Manuelle Buchungen)** — Einfache Soll/Haben-Buchungen mit SKR03
  - Korrekturbuchungen ohne Steuerberater-Software
  - **Inspiration:** [hledger Web-UI](https://hledger.org/) — minimale Eingabemaske Soll/Haben
  - **Inspiration:** [LedgerSMB](https://ledgersmb.org/) — wie manuelle GL-Einträge validiert werden
  - Neues Prisma-Model: `JournalEntry` (date, description, debit_account, credit_account, amount, tenantId)

- [ ] **DATEV Buchungssätze vollständig** — Alle Buchungstypen → vollständige GoBD-DATEV-Übergabe

---

#### Bereits umgesetzt:

- [x] **Demo-Request `/register`** — Marketing-Formular, POST `/api/demo-request`, Success-State
  - `src/app/(marketing)/register/page.tsx` + `src/app/api/demo-request/route.ts`

---

#### Referenz-Links für die Umsetzung:

| Feature | Tool | Link |
|---------|------|------|
| DATEV-Format + SKR03 | Kivitendo (Open Source ERP DE) | https://github.com/kivitendo/kivitendo-erp |
| MT940 Parser | mt940js (npm) | https://www.npmjs.com/package/mt940js |
| Bank-Import UI | InvoiceNinja Banking | https://invoiceninja.github.io/en/banking/ |
| Mahnwesen UI | InvoiceNinja Invoicing | https://invoiceninja.com/invoicing/ |
| Dunning Design | Crater (Open Source) | https://github.com/crater-invoice-inc/crater |
| Cost-Center / P&L | hledger | https://hledger.org/ |
| Journal Entries | hledger + LedgerSMB | https://ledgersmb.org/ |

### Weitere offene Features (Backlog)

- [ ] K1: Ausschuettungsmodul (Gewinnverteilung an Gesellschafter)
- [ ] A1: Leistungskurven-Analyse (Soll vs. Ist SCADA-Daten)
- [ ] A2: Komponentenverwaltung + Wartung (Turbinenteile + Historie)
- [ ] K3: Redispatch 2.0 (Abregelungen + Entschaedigungen)
- [ ] A4: Echtzeit-Status-Dashboard (Live-Karte mit Turbinen-Markern)
- [ ] U1: Mobile Inspektion (Vor-Ort-Checklisten per Smartphone)
- [ ] I2: SEPA-XML Export (Sammel-Lastschriften an Gesellschafter)

### Zurueckgestellt

- [ ] Staging-Umgebung (separate DB, Preview Deployments)
- [ ] Production Deployment (M42)

### Keine bekannten Bugs

Alle bekannten Bugs wurden behoben:
- ~~Worker-Thread-Error~~ → Behoben via `serverExternalPackages` (Phase 13)
- ~~Cost-Allocation API-Mismatch~~ → Behoben (Phase 9)
- ~~Dashboard Stats N+1~~ → Behoben (Phase 9)
- ~~Park-Wizard 500 Error~~ → Behoben (ue/ue Feld-Fix, Phase 14)
- ~~System-Config 500 Error~~ → Behoben (EMAIL_ENCRYPTION_KEY, Phase 14)

---

## Rechnungsvorlagen — Ist-Zustand

Das Rechnungssystem ist funktional komplett mit anpassbaren Vorlagen:

- Einheitliches PDF-Template fuer Rechnungen + Gutschriften
- Briefpapier-Verwaltung (Header/Footer-Bilder, Logo, Farben, DIN 5008)
- Dokumentvorlagen-Config (Sichtbarkeit von Positionen, MwSt, Bankdaten)
- Nummernkreise mit Platzhaltern ({YEAR}, {NUMBER}) und fuehrenden Nullen
- Mandanten- ODER Park-spezifische Konfiguration (Fallback-Kette)
- Wasserzeichen (ENTWURF, STORNIERT)
- Storno-Gutschriften (automatisch mit negativen Betraegen)
- XRechnung/ZUGFeRD (UBL 2.1, Validator, ZUGFeRD 2.2 COMFORT)
- Skonto (Prozent + Frist, automatische Berechnung, PDF-Ausweis)
- Teilstorno / Korrekturrechnungen (Positions-Auswahl, Teilmengen)
- Mahnwesen (3 Mahnstufen + Verzugsgebuehren)
- Wiederkehrende Rechnungen (Frequenz-Scheduling, Admin-UI)
- Abschlagsrechnungen (Pacht-Vorschuss, monatliche Generierung)
- WYSIWYG-Editor (15 Block-Typen, Drag&Drop, Live-Vorschau, Merge-Variablen)
- GoBD-konforme Archivierung (SHA-256 Hash-Chain, 10-Jahre Retention)
- DATEV-Export

---

## Geschaetztes Einsparpotential (jaehrlich)

| Automatisierung | Einsparpotential |
|----------------|-----------------|
| Automatische Pacht-Vorschussrechnungen | ~24h pro Park/Jahr |
| Geplante Berichte (monatlich/quartalsweise) | ~240h/Jahr |
| Batch-Operationen (Massen-Genehmigung etc.) | ~100h/Jahr |
| Onboarding-Wizard (30 Gesellschafter x 30min) | ~180h/Jahr |
| Freigabe-Workflows (verhindert Nacharbeit) | ~50h/Jahr |
| 5 Workflow-Wizards (Settlement, Park, Lease, Contract, Tenant) | ~200h/Jahr |
| Konsolidierte Analysen/Berichte (weniger Navigation) | ~80h/Jahr |
| Admin-Marketing-CMS (keine Entwickler fuer Textaenderungen) | ~40h/Jahr |
| SHP-Import (Fluerstuecke + Eigentuemer + Vertraege in einem Schritt) | ~120h/Jahr |
| Park-Karte mit Vertragsstatus (sofortige Uebersicht) | ~60h/Jahr |
| BF-Abrechnung (automatische Berechnung + Rechnungserstellung) | ~150h/Jahr |
| Feature-Flag pro Mandant (Self-Service Modul-Aktivierung) | ~20h/Jahr |
| ICS-Kalenderexport (Fristen direkt im Kalender-Tool) | ~30h/Jahr |
| Webhook-Benachrichtigungen (keine manuelle Weiterleitung) | ~40h/Jahr |
| In-App Benachrichtigungen (kein manuelles Nachfragen) | ~50h/Jahr |
| Serienbriefe (Massen-Kommunikation mit Platzhaltern) | ~100h/Jahr |
| Paperless-ngx (automatische Dokumenten-Archivierung) | ~80h/Jahr |
| Onboarding Tour (weniger Support-Anfragen) | ~30h/Jahr |
| Per-Turbine Pacht-Overrides (individuelle Abrechnungsanpassung) | ~20h/Jahr |
| **Gesamt** | **~1614h/Jahr (~202 Arbeitstage)** |

---

## Aenderungshistorie

### 1. März 2026 — Phase 0 & Phase 15 Planung: ERPNext-Analyse + Buchhaltungs-Paket

**Strategische Entscheidung: Kein ERPNext-Backend**
- Vollständige Analyse ERPNext vs. WPM-native Implementierung
- Entscheidung: ERPNext-Ideen nativ in WPM bauen (eine DB, kein externer Stack)
- ERPNext als optionales Docker-Addon verfügbar (für Kunden die es wollen)

**Demo-Request (erledigt):**
- `src/app/(marketing)/register/page.tsx`: Formular-Seite im Marketing-Layout
- `src/app/api/demo-request/route.ts`: POST-Endpoint mit Validierung + Logging

**Phase 15 Planung: Buchhaltungs-Paket**
- DATEV-Export Enhanced mit echten SKR03-Kontonummern
- MT940/CAMT.054 Bank-Import mit automatischem Payment-Matching
- Mahnwesen UI + direkter E-Mail-Versand aus WPM
- SKR03 Kontenplan-Mapping (konfigurierbar je Mandant)
- Cost-Center Reports (Park-P&L, XLSX-Export)
- Journal Entries (Manuelle Buchungen)

### 26. Februar 2026 — Phase 14: Kommunikation & UX

**U2: Benachrichtigungs-Center:**
- Notification Model (5 Typen), 4 API-Routes, Bell-Icon + Popover
- Vollstaendige `/notifications`-Seite mit Typ-Filter + Paginierung
- Shared UI-Utilities, Reminder-Service Integration

**K2: Serienbriefe / Mailing:**
- 3 neue Prisma-Models, 6 API-Routes, Platzhalter-Service (8 Platzhalter)
- 3-Schritt Wizard, Template-Editor, BullMQ-Integration
- Sidebar "Serienbriefe" mit Children, `mailings:read/create/send/delete`

**Paperless-ngx Integration:**
- Feature-Flag Addon, API-Client, 7 API-Routes, Sync-Worker
- Browser-Seite, Config-Form (verschluesselt), Auto-Archive Hooks

**Onboarding Product Tour:**
- driver.js, rollenbasierte Steps, Tour-Persistence, Auto-Trigger, i18n

**Park & Turbinen:**
- Park-Wizard vereinfacht (3 → 2 Schritte)
- Feld-Name-Fix (ue/ue) in 6 Dateien
- Per-Turbine Pacht-Overrides (3 Felder, Tooltip-Hints)
- Beide Calculatoren (lease-revenue + settlement) aktualisiert

**UX & Fixes:**
- Cookie-Einstellungen, Dashboard Footer, Scrollbar-Theming
- Error-Detail-Surfacing fuer System-Config, EMAIL_ENCRYPTION_KEY Fix

### 25. Februar 2026 — Performance-Audit + Workflow Quick-Wins

**Performance & Audit Fixes (Medium):**
- Permission-Cache: Migration von In-Memory zu Redis-basiert (TTL 300s)
- Energy KPIs: Redis-Caching (5 Min TTL, `?fresh=true` Bypass)
- Recharts Lazy Loading: DrillDown-Charts via `next/dynamic` mit `ssr: false`
- Shareholder Recalculation: Atomisch via `prisma.$transaction` + `Promise.all`
- API Error Helpers: `badRequest()`, `notFound()`, `forbidden()`, `serverError()`, `handleApiError()`

**Workflow Quick-Wins:**
- Batch Invoice Send: `/api/invoices/batch-send` (bis 50 gleichzeitig)
- Settlement Send-All: `/api/admin/settlement-periods/[id]/send-all-invoices`
- Skonto Auto-Apply: Automatisch bei Zahlung innerhalb Frist (keine manuelle Eingabe)
- Contract Auto-Renewal: `/api/admin/contracts/auto-renew` fuer autoRenewal-Vertraege
- Combined Calculate+Invoice: `/api/management-billing/billings/calculate-and-invoice`

### 25. Februar 2026 — Phase 12+13: Visual Overhaul, ICS-Export, Webhooks

**Visual Overhaul & Brand Identity (Phase 12):**
- Warm Navy (#335E99) als Primaerfarbe: 44 Dateien aktualisiert
- 12 CSS-Variablen fuer Charts in globals.css zentralisiert
- Marketing-Seite Redesign ("Precision Engineering" Aesthetik)
- Sidebar Dark Mode auf Brand-Navy abgestimmt

**ICS-Kalenderexport (Phase 13):**
- RFC 5545 Generator (`src/lib/export/ics.ts`), keine externen Deps
- API: `GET /api/export/calendar?type=contracts|leases|all`
- Export-Button auf Vertrags-Kalender-Seite

**Webhook-System (Phase 13):**
- 2 neue Models: `Webhook`, `WebhookDelivery`
- 13 Event-Typen in 6 Kategorien
- Dispatcher + BullMQ-Queue + Worker (HMAC-SHA256)
- Admin-UI (`/admin/webhooks`) mit CRUD, Test, Delivery-Log
- Integration in 6 bestehende API-Routes

**Worker-Thread-Fix (Phase 13):**
- `serverExternalPackages` in next.config.ts → kein Error-Spam mehr

### 21. Februar 2026 — Phase 11: BF-Billing + Feature-Flags

- 3 neue Prisma-Models, Cross-Tenant Service, 12 API-Endpoints
- 7 UI-Seiten, 6 Komponenten, 6 neue Permissions
- Feature-Flag-System: Pro-Mandant Toggles, Sidebar-Integration

### 20. Februar 2026 — Phase 10: SHP-Import & Park-Karte

- Shapefile-Import mit ALKIS-Auto-Detection, 5-Schritt-Wizard
- Park-Karte: GeoJSON-Polygone, Eigentuemer-Farben, Layer-Controls
- Park-Zuordnung: 2 Zuordnungs-Dialoge
- Vertragspartner-Feld + PersonEditDialog

### 18. Februar 2026 — Phase 8+9: UX, Wizards, Polish, Hardening

- Marketing CMS, 5 Wizards, Analytics-Konsolidierung
- UI/UX Design-System: Animations, Glassmorphism, Micro-Interactions
- Permission-Audit (9 Routes), Duplikat-Cleanup (4 Seiten)
- Admin-Konsolidierung (12-Tab → 5 Pages)

### 12.-18. Februar 2026 — Phase 4-7: Automation bis Audit

- BullMQ-System, E-Invoicing, SCADA-Automation, Topologie
- WYSIWYG-Editor, GoBD-Archivierung, Batch-APIs
- Benachrichtigungszentrum, Wiederkehrende Rechnungen
- 43 Audit-Findings gefixt, Testing (Vitest + Playwright)

### 5.-11. Februar 2026 — Phase 1-6: Foundation bis SCADA

- Komplettes Foundation bis Energy Analytics aufgebaut
- Dashboard (25 Widgets), SCADA-Import, Analyse-Dashboards

---

```bash
# Entwicklungsserver starten
npm run dev

# Datenbank-Schema synchronisieren
npx prisma db push

# Build ueberpruefen
npm run build

# Tests ausfuehren
npx vitest run

# E2E Tests
npx playwright test
```

# System-Architektur: WindparkManager (WPM)

> **Stand:** 25. Februar 2026
> **Version:** 2.0 (komplette Ueberarbeitung)

## 1. System-Uebersicht

```
                                    ┌─────────────────────────────────────┐
                                    │         TRAEFIK v3.0                │
                                    │   (Reverse Proxy, SSL, Rate Limit) │
                                    └─────────────┬───────────────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
                    ▼                             ▼                             ▼
        ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
        │   ADMIN-PORTAL    │       │  GESELLSCHAFTER-  │       │   API-ENDPOINTS   │
        │   (Next.js 15)    │       │    PORTAL         │       │   (Next.js API)   │
        │                   │       │   (Next.js 15)    │       │                   │
        │ • Mandanten       │       │                   │       │ • 475 REST-       │
        │ • User-Verwaltung │       │ • Beteiligungen   │       │   Endpunkte       │
        │ • System-Config   │       │ • Ausschuettungen │       │ • SCADA-Import    │
        │ • Rollen/Rechte   │       │ • Abstimmungen    │       │ • PDF-Export      │
        │ • Abrechnungen    │       │ • Dokumente       │       │ • Webhook-System  │
        │ • Webhooks        │       │ • Energieberichte │       │ • Batch-Ops       │
        │ • Feature-Flags   │       │ • Energy-Analysen │       │ • ICS-Export      │
        │ • Impersonation   │       │ • Berichte        │       │ • E-Mail-Queue    │
        └─────────┬─────────┘       └─────────┬─────────┘       └─────────┬─────────┘
                  │                           │                           │
                  └───────────────────────────┼───────────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │       APPLICATION LAYER       │
                              │                               │
                              │  ┌──────────┐  ┌──────────┐  │
                              │  │NextAuth  │  │  Prisma  │  │
                              │  │  v5      │  │  6 ORM   │  │
                              │  └────┬─────┘  └────┬─────┘  │
                              │       │             │         │
                              │  ┌────▼─────────────▼─────┐  │
                              │  │      PostgreSQL 16     │  │
                              │  │    (88 Models, 34 Enums,│  │
                              │  │     225 Relations)      │  │
                              │  └────────────────────────┘  │
                              └───────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
        ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
        │   MAIL-SERVICE    │   │   REDIS 7          │   │   FILE STORAGE    │
        │  (React Email +   │   │  (BullMQ 8 Queues, │   │  (MinIO S3)       │
        │   Nodemailer)     │   │   Cache, Sessions,  │   │  Presigned URLs   │
        │                   │   │   Permission-Cache) │   │                   │
        └───────────────────┘   └───────────────────┘   └───────────────────┘
                                        │
                                        ▼
                              ┌───────────────────┐
                              │  BullMQ WORKER    │
                              │  (8 Queues/Worker)│
                              │  Email, PDF,      │
                              │  Billing, Weather,│
                              │  Report, Reminder,│
                              │  SCADA, Webhook   │
                              └───────────────────┘
```

## 2. Komponenten-Beschreibung

### 2.1 Frontend-Schicht

| Komponente | Technologie | Beschreibung |
|------------|-------------|--------------|
| Admin-Portal | Next.js 15 + App Router | Superadmin-Bereich fuer Mandanten-, User- und System-Verwaltung |
| Gesellschafter-Portal | Next.js 15 + App Router | Portal fuer Kommanditisten (Beteiligungen, Abstimmungen, Dokumente, Energieberichte, Analytics) |
| Hauptanwendung | Next.js 15 + App Router | Komplette Windpark-Verwaltung fuer interne Benutzer (107 Seiten) |
| UI-Bibliothek | shadcn/ui + Tailwind CSS | 41 Basis-Komponenten, Brand Identity "Warm Navy" |
| Charts | Recharts | 12 CSS-Variablen, Diagramme fuer SCADA-Analyse, Energieberichte, Dashboard |
| Rich Text | TipTap | WYSIWYG-Editor (15 Block-Typen) fuer News, Rechnungen, Beschreibungen |
| State Management | TanStack Query + React Hooks | Server-State-Caching und Client-State |
| Formulare | React Hook Form + Zod | Formularverwaltung mit Schema-Validierung |
| Tabellen | TanStack Table | Sortierbare, filterbare Datentabellen |
| Karten | Leaflet + React-Leaflet | Kartendarstellung mit GeoJSON-Polygonen fuer Parks und Flurstuecke |
| Dashboard | react-grid-layout | Konfigurierbares Widget-Grid (12-Spalten, 27 Widgets, drag & drop) |
| i18n | next-intl | Deutsch + Englisch (Cookie-basiert) |
| PDF | @react-pdf/renderer | DIN 5008, Branding, Wasserzeichen, XRechnung/ZUGFeRD |

### 2.2 Backend-Schicht

| Komponente | Technologie | Beschreibung |
|------------|-------------|--------------|
| API Routes | Next.js 15 Route Handlers | 286 Route-Dateien, 475 HTTP-Endpoints |
| Auth | NextAuth.js v5 (Credentials) | JWT-Sessions, 6-stufige Rollen-Hierarchie |
| ORM | Prisma 6 | 88 Models, 34 Enums, 225 Relations |
| Database | PostgreSQL 16 | Multi-Tenant mit tenantId-Isolation |
| Validation | Zod | Schema-Validierung fuer alle API-Eingaben |
| Background Jobs | BullMQ + ioredis | 8 Queues + 8 Worker (Email, PDF, Billing, Weather, Report, Reminder, SCADA, Webhook) |
| Caching | Redis 7 | Permission-Cache, Dashboard-Cache, Query-Cache (8 Prefixes, 10 TTL-Stufen) |
| Webhooks | Dispatcher + BullMQ | 13 Event-Typen, HMAC-SHA256, Exponential Backoff |
| Logging | Pino (+ pino-pretty) | Strukturiertes JSON-Logging, Slow-Query-Warnung |
| Error Tracking | Sentry (@sentry/nextjs) | Fehler-Monitoring und Performance-Tracking |
| File Storage | MinIO (S3-kompatibel) | Dokumente, Logos, Anhaenge via @aws-sdk/client-s3 |
| E-Mail | React Email + Nodemailer | SMTP/SendGrid/SES, Template-basiert, Queue-basierter Versand |
| PDF | @react-pdf/renderer + pdf-lib | Rechnungen, Gutschriften, Berichte, DIN 5008, Wasserzeichen |
| SCADA-Parser | dbffile | dBASE III Parser fuer Enercon WSD/UID-Dateien |
| Shapefile | shpjs | SHP-Import mit ALKIS-Auto-Detection |
| E-Invoicing | Eigene Implementierung | XRechnung (UBL 2.1), ZUGFeRD 2.2 COMFORT |

### 2.3 Externe Services

| Service | Zweck |
|---------|-------|
| SMTP (konfigurierbar pro Mandant) | E-Mail-Versand (Benachrichtigungen, Berichte, Rechnungen) |
| OpenWeatherMap API | Wetterdaten fuer Windpark-Standorte |
| MinIO (S3-kompatibel) | Objektspeicher fuer Dokumente in Production |
| Sentry | Error-Tracking und Performance-Monitoring |
| GitHub Container Registry | Docker-Image-Registry (ghcr.io) |

## 3. Multi-Tenancy Konzept

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SHARED DATABASE                             │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  Tenant A   │  │  Tenant B   │  │  Tenant C   │                │
│  │  (tenantId  │  │  (tenantId  │  │  (tenantId  │                │
│  │   = uuid1)  │  │   = uuid2)  │  │   = uuid3)  │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
│         ▼                ▼                ▼                        │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │          APPLICATION-LEVEL TENANT ISOLATION              │     │
│  │                                                          │     │
│  │  Prisma Queries: .where({ tenantId: session.tenantId })  │     │
│  │  57 von 88 Models haben tenantId (onDelete: Cascade)     │     │
│  │  Cross-Tenant: Nur BF-Abrechnung (ParkStakeholder)       │     │
│  └──────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### Branding pro Mandant
- Logo (Header, Berichte, Rechnungen, Marketing-Seite)
- Primaerfarbe / Akzentfarbe
- Firmenname und Kontaktdaten
- E-Mail-Konfiguration (eigener SMTP-Server)
- Eigene Briefkoepfe und Dokumentvorlagen (Letterheads)
- Feature-Flags (Module pro Mandant ein-/ausschalten)

## 4. Berechtigungssystem

### 4.1 Rollen-Hierarchie (6 Stufen)

```
SUPERADMIN (100) ── Zugriff auf alle Mandanten, System-Konfiguration, Impersonation
     │
  ADMIN (80) ────── Mandanten-Admin, User-/Rollen-Verwaltung, Abrechnungsregeln
     │
  MANAGER (60) ──── Daten bearbeiten (Parks, Vertraege, Rechnungen, Energie)
     │
  MITARBEITER (50)─ Eingeschraenkte Bearbeitung
     │
  NUR_LESEN (40) ── Nur Lesezugriff
     │
  PORTAL (20) ───── Gesellschafter-Portal (eigene Daten)
```

### 4.2 Granulares Permission-System (75 Permissions)

| Modul | Berechtigungen |
|-------|---------------|
| `parks` | read, create, update, delete, export |
| `turbines` | read, create, update, delete, export |
| `funds` | read, create, update, delete, export |
| `shareholders` | read, create, update, delete, export |
| `plots` | read, create, update, delete, export |
| `leases` | read, create, update, delete, export |
| `contracts` | read, create, update, delete, export |
| `documents` | read, create, update, delete, download, export |
| `invoices` | read, create, update, delete, export |
| `votes` | read, create, update, delete, manage |
| `service-events` | read, create, update, delete, export |
| `energy` | read, create, update, delete, export, scada:import, settlements:finalize |
| `reports` | read, create, export |
| `settings` | read, update |
| `users` | read, create, update, delete, impersonate |
| `roles` | read, create, update, delete, assign |
| `admin` | manage, tenants, system, impersonate, audit |

- **Rollen sind editierbar** (SuperAdmin kann Rollen erstellen/aendern)
- **Resource Access**: Datensatz-Level Berechtigungen (z.B. Zugriff nur auf bestimmte Parks)
- **Permission-Cache**: Redis-basiert (TTL 300s, automatische Invalidierung)

### 4.3 Gesellschafter-Portal Zugriff

- Verknuepfung `Shareholder.userId` mit einem Portal-User
- Eigene Portal-Rolle mit eingeschraenkten Berechtigungen
- Sieht nur eigene Beteiligungen, Ausschuettungen, Abstimmungen, Dokumente
- Energy-Analytics Dashboard (KPIs, Trends, Turbinen-Tabelle)

## 5. Fachliche Module

### 5.1 Windpark-Verwaltung

```
Park
 ├── Turbine (1:n) ─── Anlagen mit technischen Daten
 │    ├── ServiceEvent ─── Wartungen, Stoerungen
 │    ├── ScadaMeasurement ─── 10-Min SCADA-Rohdaten
 │    ├── TurbineProduction ─── Monatliche Produktionsdaten
 │    └── TurbineOperator ─── Welche Gesellschaft betreibt (zeitlich)
 ├── Plot (1:n) ─── Flurstuecke mit Teilflaechen
 │    └── PlotArea ─── WEA_STANDORT, POOL, WEG, AUSGLEICH, KABEL
 ├── Contract (1:n) ─── Vertraege (Service, Versicherung, Netz, ...)
 ├── Document (1:n) ─── Dokumente mit Versionierung
 ├── WeatherData ─── Wetterdaten (OpenWeatherMap, Redis-Cache)
 ├── ParkRevenuePhase ─── Erloesphasen (Verguetungssaetze ueber Zeit)
 ├── NetworkNode / NetworkConnection ─── Netz-Topologie (SVG-Canvas)
 └── ParkCostAllocation ─── Umlageverfahren pro Park
```

### 5.2 Gesellschaften & Beteiligungen (Funds)

```
Fund (Gesellschaft)
 ├── FundCategory ─── BETREIBER | NETZGESELLSCHAFT | UMSPANNWERK | VERMARKTUNG | ...
 ├── Shareholder (1:n) ─── Gesellschafter mit Kapitalanteil
 │    ├── ownershipPercentage, distributionPercentage, votingRightsPercentage
 │    └── userId (optional) ─── Portal-Zugang
 ├── FundPark (n:m) ─── Beteiligung an Parks
 ├── FundHierarchy ─── Mutter-/Tochtergesellschaften (validFrom/validTo)
 ├── Vote (1:n) ─── Gesellschafterbeschluesse
 ├── Distribution (1:n) ─── Ausschuettungen
 ├── ParkStakeholder ─── Cross-Tenant BF-Abrechnung
 └── Letterhead ─── Briefkopf-Konfiguration fuer Rechnungen
```

### 5.3 Pacht & Flaechen

```
Lease (Pachtvertrag)
 ├── Person (Verpaechter) ─── Natuerliche oder juristische Person
 ├── LeasePlot (n:m) ─── Verknuepfung zu Flurstuecken
 │    └── Plot (Flurstueck)
 │         ├── county / municipality / cadastralDistrict / fieldNumber / plotNumber
 │         ├── geometry (GeoJSON) ─── SHP-Import, Karten-Darstellung
 │         └── PlotArea (1:n) ─── Teilflaechen
 │              ├── WEA_STANDORT ─── % vom Ertrag
 │              ├── POOL ─── % vom Ertrag (Pool-Flaeche)
 │              ├── WEG ─── Fixbetrag pro qm (Zuwegung)
 │              ├── AUSGLEICH ─── Fixbetrag pro qm
 │              └── KABEL ─── Fixbetrag pro Meter (Kabeltrasse)
 ├── LeaseSettlementPeriod ─── Pachtabrechnungen (Vorschuss / Endabrechnung)
 │    └── LeaseRevenueSettlement ─── Pro Verpaechter Abrechnung
 │         └── LeaseRevenueSettlementItem ─── Positionen (pro Flaeche/Typ)
 └── contractPartnerFundId ─── Vertragspartner-Gesellschaft
```

### 5.4 Energie-Modul (SCADA + Abrechnungen)

#### Datenmodell-Trennung

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ScadaMeasurement ──────► TurbineProduction ──────► EnergySettlement   │
│   (10-Min Rohdaten)        (Monatssummen)            (NB-Abrechnung)    │
│                                                                         │
│   windSpeedMs              productionKwh              netOperatorRevenue │
│   powerW                   operatingHours             distributionMode   │
│   rotorRpm                 availabilityPct             │                 │
│   nacellePosition          source (SCADA/CSV/         ▼                 │
│                             MANUAL/EXCEL)    EnergySettlementItem       │
│                                              (pro Betreiber-Fund)       │
│                                              productionShareKwh         │
│                                              revenueShareEur            │
└─────────────────────────────────────────────────────────────────────────┘
```

#### SCADA-Subsystem (15 Models)

```
ScadaTurbineMapping ─── Loc_xxxx + PlantNo → Turbine-Zuordnung
ScadaMeasurement ────── 10-Min-Rohdaten
ScadaImportLog ─────── Import-Protokoll
ScadaAutoImportLog ──── Auto-Import via BullMQ (taeglich 02:00)
ScadaAnomaly ────────── Erkannte Anomalien
ScadaAnomalyConfig ──── Konfig pro Park (4 Algorithmen)
ScadaAvailability ───── Verfuegbarkeitsdaten
ScadaStateEvent ─────── Betriebszustandswechsel
ScadaStateSummary ───── Aggregierte Zustandszeiten
ScadaTextEvent ──────── Textuelle Ereignisse
ScadaWarningEvent ───── Warnmeldungen
ScadaWarningSummary ─── Aggregierte Warnungen
ScadaWindSummary ────── Wind-Zusammenfassungen
```

#### Energy Analytics (8 Tabs)
- Performance, Verfuegbarkeit, Turbinenvergleich, Stoerungen
- Umwelt, Finanzen, Daten-Explorer, Datenabgleich

#### Strom-Verteilungskonzept

```
NB-Gutschrift (Netzbetreiber/Direktvermarkter)
     │
     ▼
Netz GbR / Umspannwerk GmbH        ◄── Park.billingEntityFundId
     │
     ├── Verteilmodus (am Park konfiguriert):
     │    ├── PROPORTIONAL ── nach tatsaechlichem Produktionsanteil
     │    ├── SMOOTHED ────── geglaettet (Durchschnitt)
     │    └── TOLERATED ───── mit Toleranzgrenze (z.B. 5%)
     │
     ▼
Betreibergesellschaften (Funds)
     │
     └── pro Turbine/Fund:
          productionShareKwh + revenueShareEur
```

### 5.5 Rechnungswesen

```
Invoice (Rechnung / Gutschrift)
 ├── InvoiceType: INVOICE | CREDIT_NOTE
 ├── InvoiceItem (1:n) ─── Positionen mit DATEV-Konten
 │    ├── datevKonto, datevGegenkonto, datevKostenstelle
 │    └── taxType: STANDARD (19%) | REDUCED (7%) | EXEMPT (0%)
 ├── Storno: cancelledInvoiceId (Self-Relation) + Teilstorno
 ├── Skonto: skontoPercent, skontoDeadline (Auto-Apply bei Zahlung)
 ├── Mahnwesen: 3 Stufen + Verzugsgebuehren (Billing-Worker)
 ├── PDF-Generierung mit Briefkopf (Letterhead), DIN 5008, Wasserzeichen
 ├── E-Invoicing: XRechnung (UBL 2.1), ZUGFeRD 2.2 COMFORT
 ├── InvoiceNumberSequence ─── Fortlaufende Nummern pro Typ/Mandant
 ├── RecurringInvoice ─── Wiederkehrende Rechnungen (Frequenz-Scheduling)
 ├── GoBD-Archivierung: SHA-256 Hash-Chain, 10-Jahre Retention
 ├── DATEV-Export: Standard-Buchungsformat
 └── Soft-Delete: deletedAt (Aufbewahrungspflicht, AO §147 / HGB §257)

Distribution (Ausschuettung)
 ├── DistributionItem (1:n) ─── pro Gesellschafter
 │    ├── percentage + amount
 │    └── invoiceId ─── generierte Gutschrift (1:1)
 └── status: DRAFT → EXECUTED → (CANCELLED)

ManagementBilling (BF-Abrechnung)
 ├── ParkStakeholder ─── Cross-Tenant Verknuepfung
 ├── StakeholderFeeHistory ─── Historische Gebuehren
 ├── status: DRAFT → CALCULATED → INVOICED
 └── baseRevenue × feePercentage + MwSt
```

### 5.6 Abstimmungen (Votes)

```
Vote (Gesellschafterbeschluss)
 ├── voteType: simple (Ja/Nein/Enthaltung) oder custom
 ├── quorumPercentage + requiresCapitalMajority
 ├── status: DRAFT → ACTIVE → CLOSED
 ├── VoteResponse (1:n) ─── Stimmabgabe pro Gesellschafter
 ├── VoteProxy ─── Stimmrechtsvertretung (mit validFrom/validUntil, Dokument)
 └── PDF-Export: Ergebnisbericht
```

### 5.7 Dokumente

```
Document
 ├── category: CONTRACT | PROTOCOL | REPORT | INVOICE | PERMIT | CORRESPONDENCE | OTHER
 ├── Versionierung: parentId (Self-Relation) + versions[]
 ├── Tags-Array fuer Kategorisierung
 ├── Approval: DocumentApprovalStatus (PENDING/APPROVED/REJECTED)
 ├── Optionale Zuordnung: Park, Turbine, Fund, Contract, Shareholder, ServiceEvent
 ├── Volltext-Suche ueber Metadaten
 └── GoBD-Archivierung: ArchivedDocument + ArchiveVerificationLog

DocumentTemplate ─── Dokumentvorlagen pro Typ/Park (WYSIWYG-Editor)
Letterhead ─── Briefkoepfe pro Fund (Logo, Absender, Fusszeile, DIN 5008)
```

## 6. Background-Processing

### 6.1 BullMQ Queue-System (8 Queues)

| Queue | Worker | Zweck | Retries | Backoff |
|-------|--------|-------|---------|---------|
| email | processEmailJob | E-Mail-Versand (SMTP/SendGrid/SES) | 3 | Exp. 2s |
| pdf | processPdfJob | PDF-Generierung (Rechnungen, Berichte) | 3 | Exp. 5s |
| billing | processBillingJob | Auto-Billing, Recurring Invoices, Mahnungen | 3 | Exp. 10s |
| weather | processWeatherJob | OpenWeatherMap Sync | 3 | Exp. 3s |
| report | processReportJob | Geplante Berichte (taeglich 06:00) | 2 | Exp. 30s |
| reminder | processReminderJob | Erinnerungen (taeglich 08:00) | 2 | Exp. 30s |
| scada-auto-import | processScadaAutoImportJob | SCADA-Import (taeglich 02:00) | 3 | Exp. 60s |
| webhook | processWebhookDelivery | HTTP-POST an externe URLs | 3 | Exp. 10s |

### 6.2 Webhook-System

13 Event-Typen in 6 Kategorien:
- **Rechnungen**: invoice.created, invoice.sent, invoice.paid, invoice.overdue
- **Vertraege**: contract.expiring, contract.expired
- **Abrechnungen**: settlement.created, settlement.finalized
- **Abstimmungen**: vote.created, vote.closed
- **Dokumente**: document.uploaded, document.approved
- **Service-Events**: service_event.created

Sicherheit: HMAC-SHA256 Signatur (`X-Webhook-Signature`), 5s Timeout, Delivery-Log

## 7. Cache-System (Redis)

### 7.1 Cache-Architektur

```
Redis 7 (ioredis)
 ├── Permission-Cache ─── user:permissions:{userId} (TTL 300s)
 ├── Dashboard-Cache ──── dashboard:{tenantId}:{key} (TTL 60-300s)
 ├── Tenant-Settings ──── tenant:{tenantId}:settings (TTL 600s)
 ├── Energy-Data ──────── energy:{tenantId}:{key} (TTL 300s)
 ├── Analytics ─────────── analytics:{tenantId}:{key} (TTL 300s)
 └── BullMQ Queues ─────── 8 Queue-Datenstrukturen
```

### 7.2 TTL-Stufen

| Stufe | TTL | Verwendung |
|-------|-----|------------|
| SHORT | 30s | Volatile Daten |
| DASHBOARD | 60s | Dashboard-Statistiken |
| MEDIUM | 300s | Allgemeine Daten, Permissions, Energy |
| TENANT_SETTINGS | 600s | Mandanten-Konfiguration |
| LONG | 3600s | Stabile Referenzdaten |

### 7.3 Cache-Invalidierung

Automatische Invalidierung bei Entity-Aenderungen:
- Park/Turbine → Park-Stats + Widget-Caches
- Fund/Shareholder → Fund-Stats + Widget-Caches
- Invoice → Invoice-Stats Widget
- Energy → Energy/SCADA Widgets
- Tenant → Alle Caches des Mandanten

## 8. Sicherheitskonzept

### 8.1 Authentifizierung & Autorisierung
- **JWT-Token** (NextAuth.js v5) mit Session-Strategie
- **Application-Level Tenant Isolation** (57 Models mit tenantId)
- **RBAC** mit 6-stufiger Hierarchie und 75 granularen Permissions
- **Resource Access**: Datensatz-Level Berechtigungen
- **Permission-Cache**: Redis-basiert (nicht mehr In-Memory)
- **Impersonation**: SuperAdmin kann als anderer User agieren (mit Audit-Log)

### 8.2 HTTP-Sicherheit

| Header | Wert |
|--------|------|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload |
| Content-Security-Policy | default-src 'self'; connect-src 'self' https://*.sentry.io |
| Permissions-Policy | camera=(), microphone=(), geolocation=(self) |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |

### 8.3 Rate Limiting

| Typ | Requests | Fenster | Einsatz |
|-----|----------|---------|---------|
| AUTH | 5 | 15 Min | Login, Passwort-Reset |
| UPLOAD | 20 | 1 Min | Datei-Uploads |
| PDF | 10 | 1 Min | PDF-Generierung |
| API | 100 | 1 Min | Allgemeine API |

### 8.4 Datensicherheit
- **Verschluesselung**: AES-256-GCM fuer sensible Daten, TLS 1.2+ fuer Transport
- **Passwort-Hashing**: bcryptjs
- **Audit-Log**: Alle Aenderungen protokolliert (AuditLog-Tabelle)
- **Backup**: Automatisch (taeglich/woechentlich/monatlich), optional S3-Upload
- **DSGVO-konform**: Datenexport, Loeschfunktion, Soft-Delete
- **Aufbewahrungspflicht**: Rechnungen mit Soft-Delete (10 Jahre, AO §147)
- **GoBD**: SHA-256 Hash-Chain, 10-Jahre Retention, Audit-Export

### 8.5 Input-Validierung
- Server-seitige Validierung mit Zod-Schemas in jeder API-Route
- Prisma Parameterized Queries (SQL Injection Prevention)
- XSS-Schutz durch React-Escaping + isomorphic-dompurify
- CSRF-Schutz durch NextAuth.js / SameSite Cookies

## 9. Datenmodell

### 9.1 Alle Modelle (88 Stueck)

| Bereich | Modelle |
|---------|---------|
| **Kern** (6) | Tenant, User, Account, Session, VerificationToken, PasswordResetToken |
| **Parks & Anlagen** (4) | Park, Turbine, ParkRevenuePhase, ServiceEvent |
| **Gesellschaften** (7) | Fund, FundPark, FundHierarchy, FundCategory, Person, Shareholder, ParkStakeholder |
| **Pacht & Flaechen** (9) | Lease, LeasePlot, Plot, PlotArea, LeaseSettlementPeriod, LeaseRevenueSettlement, LeaseRevenueSettlementItem, ParkCostAllocation, ParkCostAllocationItem |
| **Vertraege & Dokumente** (5) | Contract, Document, DocumentTemplate, ArchivedDocument, ArchiveVerificationLog |
| **Rechnungswesen** (12) | Invoice, InvoiceItem, InvoiceTemplate, InvoiceItemTemplate, InvoiceNumberSequence, RecurringInvoice, Distribution, DistributionItem, ManagementBilling, StakeholderFeeHistory, TaxRateConfig, PositionTaxMapping |
| **Abstimmungen** (3) | Vote, VoteResponse, VoteProxy |
| **Energie** (6) | EnergySettlement, EnergySettlementItem, EnergyRevenueType, EnergyMonthlyRate, TurbineProduction, TurbineOperator |
| **SCADA** (15) | ScadaTurbineMapping, ScadaMeasurement, ScadaImportLog, ScadaAutoImportLog, ScadaAnomaly, ScadaAnomalyConfig, ScadaAvailability, ScadaStateEvent, ScadaStateSummary, ScadaTextEvent, ScadaWarningEvent, ScadaWarningSummary, ScadaWindSummary, NetworkNode, NetworkConnection |
| **System** (6) | Notification, News, WeatherData, AuditLog, SystemConfig, MassCommunication |
| **Berechtigungen** (5) | Permission, Role, RolePermission, UserRoleAssignment, ResourceAccess |
| **Admin** (6) | Letterhead, EmailTemplate, BillingRule, BillingRuleExecution, EnergyReportConfig, ScheduledReport |
| **Berichte** (1) | GeneratedReport |
| **Webhooks** (2) | Webhook, WebhookDelivery |

### 9.2 Alle Enums (34 Stueck)

| Enum | Werte |
|------|-------|
| UserRole | SUPERADMIN, ADMIN, MANAGER, MITARBEITER, NUR_LESEN, PORTAL |
| EntityStatus | ACTIVE, INACTIVE, ARCHIVED |
| ContractType | LEASE, SERVICE, INSURANCE, GRID_CONNECTION, MARKETING, OTHER |
| ContractStatus | DRAFT, ACTIVE, EXPIRING, EXPIRED, TERMINATED |
| InvoiceType | INVOICE, CREDIT_NOTE |
| InvoiceStatus | DRAFT, SENT, PAID, CANCELLED |
| TaxType | STANDARD (19%), REDUCED (7%), EXEMPT (0%) |
| DistributionMode | PROPORTIONAL, SMOOTHED, TOLERATED |
| DistributionStatus | DRAFT, EXECUTED, CANCELLED |
| PlotAreaType | WEA_STANDORT, POOL, WEG, AUSGLEICH, KABEL |
| ProductionDataSource | MANUAL, CSV_IMPORT, EXCEL_IMPORT, SCADA |
| ProductionStatus | DRAFT, CONFIRMED, INVOICED |
| EnergySettlementStatus | DRAFT, CALCULATED, INVOICED, CLOSED |
| EnergyCalculationType | ... |
| SettlementPeriodStatus | OPEN, IN_PROGRESS, CLOSED |
| LeaseSettlementMode | ... |
| LeaseRevenueSettlementStatus | ... |
| ManagementBillingStatus | DRAFT, CALCULATED, INVOICED |
| ParkCostAllocationStatus | ... |
| ParkStakeholderRole | ... |
| CompensationType | ... |
| BillingRuleType | LEASE_PAYMENT, DISTRIBUTION, MANAGEMENT_FEE, CUSTOM |
| BillingRuleFrequency | MONTHLY, QUARTERLY, SEMI_ANNUAL, ANNUAL, CUSTOM_CRON |
| DocumentCategory | CONTRACT, PROTOCOL, REPORT, INVOICE, PERMIT, CORRESPONDENCE, OTHER |
| DocumentType | ... |
| DocumentApprovalStatus | PENDING, APPROVED, REJECTED |
| VoteStatus | DRAFT, ACTIVE, CLOSED |
| NotificationType | ... |
| NewsCategory | GENERAL, FINANCIAL, TECHNICAL, ... |
| ReportType | MONTHLY, ANNUAL, SHAREHOLDERS, SETTLEMENT, ... |
| ReportFormat | PDF, EXCEL, CSV |
| ScheduledReportSchedule / ScheduledReportType | ... |
| ReminderCategory | ... |

### 9.3 Wichtige Datenmuster

- **Multi-Tenancy**: 57 Models mit `tenantId` FK mit `onDelete: Cascade`
- **Soft-Delete bei Rechnungen**: `deletedAt` fuer 10-Jahre Aufbewahrungspflicht
- **Historische Nachverfolgung**: TurbineOperator, FundHierarchy, StakeholderFeeHistory mit `validFrom`/`validTo`
- **Dokumenten-Versionierung**: Self-Relation ueber `parentId`
- **Composite Unique Keys**: z.B. `[turbineId, year, month, tenantId]` bei TurbineProduction
- **Dezimal-Praezision**: Finanzen `Decimal(15,2)`, Prozente `Decimal(5,2)`, Koordinaten `Decimal(10,8)`
- **DATEV-Integration**: Felder fuer Buchungsschluessel, Konten, Kostenstellen auf InvoiceItem
- **GeoJSON**: Plot.geometry fuer Karten-Darstellung (SHP-Import)

## 10. Navigation & Seitenstruktur

### 10.1 Hauptanwendung (107 Dashboard-Seiten)

```
Sidebar-Navigation (6 Gruppen, 35+ Items)
├── Dashboard (/dashboard)
│
├── Windparks
│   ├── Parks (/parks) ─── parks:read
│   └── Service-Events (/service-events) ─── service-events:read
│
├── Finanzen
│   ├── Rechnungen (/invoices) ─── invoices:read [aufklappbar]
│   │   ├── Uebersicht (/invoices)
│   │   ├── Versanduebersicht (/invoices/dispatch)
│   │   └── Zahlungs-Abgleich (/invoices/reconciliation)
│   ├── Vertraege (/contracts) ─── contracts:read
│   ├── Beteiligungen (/funds) ─── funds:read
│   ├── Energie (/energy) ─── energy:read [aufklappbar]
│   │   ├── Uebersicht (/energy)
│   │   ├── Produktionsdaten (/energy/productions)
│   │   ├── Netzbetreiber-Daten (/energy/settlements)
│   │   ├── SCADA-Messdaten (/energy/scada/data)
│   │   ├── SCADA-Zuordnung (/energy/scada)
│   │   ├── Netz-Topologie (/energy/topology)
│   │   ├── Analysen (/energy/analytics)
│   │   └── Anomalie-Erkennung (/energy/scada/anomalies)
│   └── Betriebsfuehrung (/management-billing) ─── [Feature-Flag] [aufklappbar]
│       ├── Uebersicht (/management-billing)
│       ├── BF-Vertraege (/management-billing/stakeholders)
│       └── Abrechnungen (/management-billing/billings)
│
├── Verwaltung
│   ├── Pacht (/leases) ─── leases:read [aufklappbar]
│   │   ├── Pachtvertraege (/leases)
│   │   ├── Pachtabrechnung (/leases/settlement)
│   │   ├── Vorschuesse (/leases/advances)
│   │   ├── Zahlungen (/leases/payments)
│   │   └── SHP-Import (/leases/import-shp)
│   ├── Dokumente (/documents) ─── documents:read
│   ├── Abstimmungen (/votes) ─── votes:read
│   ├── Meldungen (/news)
│   └── Berichte (/reports) ─── reports:read [aufklappbar]
│       ├── Berichte erstellen (/reports)
│       └── Berichtsarchiv (/reports/archive)
│
├── Administration
│   ├── Einstellungen (/settings) ─── settings:read
│   ├── Rollen & Rechte (/admin/roles) ─── roles:read
│   ├── Abrechnungsperioden (/admin/settlement-periods)
│   ├── Abrechnungsregeln (/admin/billing-rules)
│   ├── Zugriffsreport (/admin/access-report)
│   ├── E-Mail-Vorlagen (/admin/email)
│   ├── Massen-Kommunikation (/admin/mass-communication)
│   ├── Rechnungseinstellungen (/admin/invoices)
│   ├── Vorlagen (/admin/templates)
│   └── GoBD-Archiv (/admin/archive)
│
└── System (SUPERADMIN)
    ├── Mandanten (/admin/tenants)
    ├── Einstellungen (/admin/system-settings)
    ├── System & Wartung (/admin/system)
    ├── System-Konfiguration (/admin/system-config)
    ├── Audit-Logs (/admin/audit-logs)
    ├── Backup & Speicher (/admin/backup)
    ├── Marketing (/admin/marketing)
    ├── Verguetungsarten (/admin/revenue-types)
    ├── Steuersaetze (/admin/tax-rates)
    ├── Gesellschaftstypen (/admin/fund-categories)
    └── Webhooks (/admin/webhooks)
```

### 10.2 Gesellschafter-Portal (12 Seiten)

```
Portal (/portal)
├── Startseite (/portal)
├── Profil (/portal/profile)
├── Beteiligungen (/portal/participations)
├── Ausschuettungen (/portal/distributions)
├── Abstimmungen (/portal/votes)
│   └── Detail (/portal/votes/[id])
├── Stimmrechtsvertretung (/portal/proxies)
├── Dokumente (/portal/documents)
├── Berichte (/portal/reports)
├── Energieberichte (/portal/energy-reports)
│   └── Report (/portal/energy-reports/[configId])
├── Energy-Analytics (/portal/energy-analytics)
└── Einstellungen (/portal/settings)
```

### 10.3 Oeffentliche Seiten

```
Marketing (/):  Startseite, Impressum, Datenschutz
Auth:           Login, Passwort vergessen, Passwort zuruecksetzen
```

## 11. API-Uebersicht

286 Route-Dateien, 475 HTTP-Endpoints:

| Modul | Routes | Endpoints | Beschreibung |
|-------|--------|-----------|--------------|
| `/api/admin` | 94 | ~186 | Users, Roles, Settings, Billing, Webhooks, System |
| `/api/energy` | 43 | ~80 | Productions, SCADA, Settlements, Analytics, Topology |
| `/api/leases` | 25 | ~48 | Pachtvertraege, Settlement, Usage-Fees, Cost-Allocation |
| `/api/invoices` | 15 | ~33 | CRUD, Send, Mark-Paid, Batch, PDF, XRechnung |
| `/api/management-billing` | 13 | ~24 | Billings, Stakeholders, Calculate-and-Invoice |
| `/api/portal` | 13 | ~26 | My-Profile, My-Participations, My-Documents, Energy |
| `/api/funds` | 9 | 17 | CRUD, Hierarchy, Distributions, Recalculate |
| `/api/documents` | 7 | 14 | CRUD, Approve, Download, Versions, Search |
| `/api/reports` | 6 | ~12 | Reports, Annual, Monthly, Archive |
| `/api/user` | 6 | ~10 | Settings, Password, Avatar, Dashboard-Config |
| `/api/plots` | 6 | ~12 | CRUD, Areas, SHP-Import |
| `/api/webhooks` | 5 | ~10 | CRUD, Test, Deliveries |
| `/api/batch` | 4 | 7 | Invoices, Email, Documents, Settlements |
| `/api/notifications` | 4 | 6 | CRUD, Mark-All-Read, Unread-Count |
| `/api/auth` | 3 | 4 | Login, Forgot/Reset Password, Permissions |
| `/api/votes` | 3 | 6 | CRUD, Export |
| `/api/proxies` | 3 | 6 | CRUD, Document |
| `/api/shareholders` | 4 | 8 | CRUD, Portal-Access, Onboard |
| `/api/parks` | 3 | 6 | CRUD, Revenue-Phases |
| `/api/contracts` | 3 | 6 | CRUD, Auto-Renew |
| `/api/dashboard` | 3 | 3 | Widgets, Energy-KPIs, Stats |
| `/api/export` | 2 | 2 | CSV/Excel/DATEV, ICS-Kalender |
| `/api/misc` | ~8 | ~10 | Health, Upload, Weather, News, Turbines, Service-Events |

## 12. Docker-Container-Struktur

```yaml
services:
  app:           # Next.js 15 Application (Port 3000)
  worker:        # BullMQ Worker (2+ Replicas, START_MODE=worker)
  postgres:      # PostgreSQL 16 (nicht extern exponiert)
  redis:         # Redis 7 (AOF, maxmemory 256mb)
  minio:         # MinIO S3 (API :9000, Console :9001)
  minio-init:    # Bucket-Initialisierung (One-Shot)
  traefik:       # Reverse Proxy, SSL, Rate Limiting
  backup:        # pg_dump Cron (taeglich/woechentlich/monatlich)
```

### Multi-Stage Dockerfile (4 Stages)

```
Stage 1: deps        → npm install (alle Dependencies)
Stage 2: builder     → Next.js Build (standalone Output)
Stage 2b: prisma-cli → Isolierte Prisma-Installation (/prisma-cli/)
Stage 3: runner      → Production Image (Non-Root, Health-Check)
```

**Kritisch**: Prisma CLI muss in `/prisma-cli/` isoliert sein (nicht `/app/node_modules/`), da Next.js Standalone `@prisma/config` OHNE die transitive Dependency `effect` einbindet.

## 13. Entwicklungsumgebung vs. Produktion

| Aspekt | Development | Production |
|--------|-------------|------------|
| Database | Lokale PostgreSQL 16 (Docker) | PostgreSQL 16 (Docker/Portainer) |
| ORM | Prisma mit `prisma db push` | Prisma mit `prisma db push --accept-data-loss` |
| Storage | Lokales Dateisystem / MinIO | MinIO (S3-kompatibel, Docker) |
| Auth | NextAuth.js v5 (JWT) | NextAuth.js v5 (JWT, trustHost: true) |
| Mail | Mailhog (Fake-SMTP, Port 8025) | SMTP (konfigurierbar pro Mandant) |
| SSL | Kein SSL (localhost) | Let's Encrypt (via Traefik) |
| Worker | `tsx watch` (Hot-Reload) | BullMQ Worker (2+ Replicas) |
| Logging | pino-pretty (formatiert) | Pino JSON (strukturiert) |
| Error Tracking | Console | Sentry |
| Cache | Redis (Fallback: In-Memory) | Redis 7 |
| CI/CD | - | GitHub Actions → ghcr.io → Portainer |

## 14. Monitoring & Logging

- **Application Monitoring**: Sentry fuer Error-Tracking und Performance
- **Infrastructure**: Docker Health Checks fuer alle Services (30s Interval)
- **Logging**: Strukturiertes JSON-Logging mit Pino (Slow-Query-Warnung bei >100ms)
- **Health Checks**: `/api/health` Endpoint, `/api/admin/system` Dashboard
- **Alerting**: Sentry Webhooks
- **Audit-Trail**: Alle Datenaenderungen in AuditLog-Tabelle
- **Cache-Stats**: `/api/admin/cache` fuer Hit/Miss-Raten
- **Queue-Monitoring**: `/api/admin/jobs` fuer BullMQ Queue-Status

## 15. Kennzahlen

| Metrik | Wert |
|--------|------|
| Prisma Models | 88 |
| Prisma Enums | 34 |
| Relations | 225 |
| API Route Files | 286 |
| HTTP Endpoints | 475 |
| Dashboard Pages | 107 |
| Portal Pages | 12 |
| Auth/Marketing Pages | 7 |
| Total Components | 163 |
| Dashboard Widgets | 27 |
| Sidebar Nav Items | 35+ |
| Permissions | 75 |
| BullMQ Queues/Workers | 8/8 |
| Webhook Events | 13 |
| Workflow Wizards | 5 |
| i18n Sprachen | 2 (DE/EN) |
| Cache Prefixes | 8 |
| Security Headers | 9 |
| Rate Limit Presets | 4 |

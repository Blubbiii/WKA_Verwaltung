# System-Architektur: WindparkManager (WPM)

## 1. System-Uebersicht

```
                                    ┌─────────────────────────────────────┐
                                    │           LOAD BALANCER             │
                                    │         (Traefik/Nginx)             │
                                    └─────────────┬───────────────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
                    ▼                             ▼                             ▼
        ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
        │   ADMIN-PORTAL    │       │  GESELLSCHAFTER-  │       │   API-ENDPOINTS   │
        │   (Next.js 15)    │       │    PORTAL         │       │   (Next.js API)   │
        │                   │       │   (Next.js 15)    │       │                   │
        │ • Mandanten       │       │                   │       │ • 177+ REST-      │
        │ • User-Verwaltung │       │ • Beteiligungen   │       │   Endpunkte       │
        │ • System-Config   │       │ • Ausschuettungen │       │ • SCADA-Import    │
        │ • Rollen/Rechte   │       │ • Abstimmungen    │       │ • PDF-Export      │
        │ • Abrechnungen    │       │ • Dokumente       │       │ • E-Mail-Versand  │
        │ • Impersonation   │       │ • Energieberichte │       │ • Billing-Worker  │
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
                              │  │  v5      │  │   ORM    │  │
                              │  └────┬─────┘  └────┬─────┘  │
                              │       │             │         │
                              │  ┌────▼─────────────▼─────┐  │
                              │  │      PostgreSQL 16     │  │
                              │  │   (via Prisma Client)  │  │
                              │  └────────────────────────┘  │
                              └───────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
        ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
        │   MAIL-SERVICE    │   │   REDIS / CACHE   │   │   FILE STORAGE    │
        │  (React Email +   │   │  (BullMQ, Cache,  │   │  (Lokal / MinIO   │
        │   Nodemailer)     │   │   Sessions)       │   │   S3-kompatibel)  │
        └───────────────────┘   └───────────────────┘   └───────────────────┘
```

## 2. Komponenten-Beschreibung

### 2.1 Frontend-Schicht

| Komponente | Technologie | Beschreibung |
|------------|-------------|--------------|
| Admin-Portal | Next.js 15 + App Router | Superadmin-Bereich fuer Mandanten-, User- und System-Verwaltung |
| Gesellschafter-Portal | Next.js 15 + App Router | Readonly-Portal fuer Kommanditisten (Beteiligungen, Abstimmungen, Dokumente, Energieberichte) |
| Hauptanwendung | Next.js 15 + App Router | Komplette Windpark-Verwaltung fuer interne Benutzer |
| UI-Bibliothek | shadcn/ui + Tailwind CSS | Konsistente, barrierefreie Komponenten |
| Charts | Recharts | Diagramme fuer SCADA-Analyse, Energieberichte, Dashboard |
| Rich Text | TipTap | WYSIWYG-Editor fuer News, Beschreibungen |
| State Management | TanStack Query (React Query) + React Hooks | Server-State-Caching und Client-State |
| Formulare | React Hook Form + Zod | Formularverwaltung mit Schema-Validierung |
| Tabellen | TanStack Table | Sortierbare, filterbare Datentabellen |
| Karten | Leaflet + React-Leaflet | Kartendarstellung fuer Windparks und Flurstuecke |
| Dashboard | react-grid-layout | Konfigurierbares Widget-Grid (12-Spalten, drag & drop) |

### 2.2 Backend-Schicht

| Komponente | Technologie | Beschreibung |
|------------|-------------|--------------|
| API Routes | Next.js 15 Route Handlers (App Router) | 177+ REST-Endpoints fuer CRUD und Business-Logik |
| Auth | NextAuth.js v5 mit Credentials Provider | JWT-basierte Authentifizierung mit Session-Strategie |
| ORM | Prisma (mit @prisma/client) | Type-safe Database Client mit Migrations |
| Database | PostgreSQL 16 | Relationale Datenbank mit 38 Modellen |
| Validation | Zod | Schema-Validierung fuer alle API-Eingaben |
| Background Jobs | BullMQ + ioredis | Asynchrone Aufgaben (E-Mail, Reports, Billing) |
| Caching | Redis + In-Memory | Permission-Cache, Query-Cache, Session-Cache |
| Logging | Pino (+ pino-pretty fuer Development) | Strukturiertes JSON-Logging |
| Error Tracking | Sentry (@sentry/nextjs) | Fehler-Monitoring und Performance-Tracking |
| File Storage | Lokales Dateisystem / MinIO (S3-kompatibel) | Dokumente, Logos, Anhaenge via @aws-sdk/client-s3 |
| E-Mail | React Email + Nodemailer | Template-basierter E-Mail-Versand (konfigurierbar pro Mandant) |
| PDF | @react-pdf/renderer | PDF-Generierung fuer Rechnungen, Gutschriften, Berichte |
| SCADA-Parser | dbase (npm) | dBASE III Parser fuer Enercon WSD/UID-Dateien |

### 2.3 Externe Services

| Service | Zweck |
|---------|-------|
| SMTP (konfigurierbar pro Mandant) | E-Mail-Versand (Benachrichtigungen, Berichte) |
| OpenWeatherMap API | Wetterdaten fuer Korrelationsanalysen |
| MinIO (S3-kompatibel) | Objektspeicher fuer Dokumente in Production |
| Sentry | Error-Tracking und Performance-Monitoring |

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
│  │  Jeder User sieht NUR Daten seines Mandanten             │     │
│  └──────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

Die Mandanten-Isolation wird auf Application-Level durch Prisma-Queries mit `tenantId`-Filter sichergestellt. Jede Tabelle, die mandantenspezifische Daten enthaelt, hat eine `tenantId`-Spalte mit Foreign Key auf die `tenants`-Tabelle. API-Routen extrahieren die `tenantId` aus dem JWT-Token der NextAuth-Session und filtern alle Queries entsprechend.

### Branding pro Mandant
- Logo (Header, Berichte, Rechnungen)
- Primaerfarbe / Akzentfarbe
- Firmenname und Kontaktdaten
- E-Mail-Konfiguration (eigener SMTP-Server)
- Eigene Briefkoepfe und Dokumentvorlagen

## 4. Berechtigungssystem

### 4.1 Rollen-Hierarchie

```
SUPERADMIN (3) ─── Zugriff auf alle Mandanten, System-Konfiguration
     │
  ADMIN (2) ────── Mandanten-Admin, User-/Rollen-Verwaltung, Abrechnungsregeln
     │
  MANAGER (1) ──── Daten bearbeiten (Parks, Vertraege, Rechnungen, Energie)
     │
  VIEWER (0) ───── Nur Lesezugriff
```

### 4.2 Granulares Permission-System

Rollen bestehen aus granularen Berechtigungen, die pro Modul und Aktion definiert sind:

| Modul | Berechtigungen |
|-------|---------------|
| `parks` | read, create, update, delete |
| `funds` | read, create, update, delete |
| `invoices` | read, create, update, delete |
| `contracts` | read, create, update, delete |
| `leases` | read, create, update, delete |
| `documents` | read, create, update, delete |
| `energy` | read, create, update, delete |
| `votes` | read, create, update, delete |
| `reports` | read, create |
| `settings` | read, write |
| `service-events` | read, create, update, delete |
| `admin` | users, tenants, system |

- **Rollen sind editierbar** (SuperAdmin kann Rollen erstellen/aendern)
- **Resource Access**: Datensatz-Level Berechtigungen (z.B. Zugriff nur auf bestimmte Parks)
- **Permission-Cache**: In-Memory-Cache fuer schnelle Berechtigungspruefungen

### 4.3 Gesellschafter-Portal Zugriff

Gesellschafter (Kommanditisten) koennen einen Portal-Zugang erhalten:
- Verknuepfung `Shareholder.userId` mit einem Portal-User
- Eigene Portal-Rolle mit eingeschraenkten Berechtigungen
- Sieht nur eigene Beteiligungen, Ausschuettungen, Abstimmungen, Dokumente

## 5. Fachliche Module

### 5.1 Windpark-Verwaltung

```
Park
 ├── Turbine (1:n) ─── Anlagen mit technischen Daten
 │    ├── ServiceEvent ─── Wartungen, Stoerungen
 │    ├── ScadaMeasurement ─── 10-Min SCADA-Rohdaten
 │    └── TurbineProduction ─── Monatliche Produktionsdaten
 ├── Plot (1:n) ─── Flurstuecke mit Teilflaechen
 │    └── PlotArea ─── WEA-Standort, Pool, Weg, Ausgleich, Kabel
 ├── Contract (1:n) ─── Vertraege (Service, Versicherung, Netz, ...)
 ├── Document (1:n) ─── Dokumente mit Versionierung
 ├── WeatherData ─── Wetterdaten (OpenWeatherMap)
 └── ParkRevenuePhase ─── Erloesphasen (Verguetungssaetze ueber Zeit)
```

### 5.2 Gesellschaften & Beteiligungen (Funds)

```
Fund (Gesellschaft)
 ├── FundType: BETREIBER | NETZGESELLSCHAFT | UMSPANNWERK | VERMARKTUNG | SONSTIGE
 ├── Shareholder (1:n) ─── Gesellschafter mit Kapitalanteil
 │    ├── ownershipPercentage ─── Beteiligungsquote
 │    ├── distributionPercentage ─── Ausschuettungsquote
 │    └── userId (optional) ─── Portal-Zugang
 ├── FundPark (n:m) ─── Beteiligung an Parks
 ├── FundHierarchy ─── Mutter-/Tochtergesellschaften
 │    (Fund ← → Fund mit validFrom/validTo)
 ├── Vote (1:n) ─── Abstimmungen
 ├── Distribution (1:n) ─── Ausschuettungen
 └── TurbineOperator ─── Welche Gesellschaft betreibt welche Turbine (zeitlich)
```

### 5.3 Pacht & Flaechen

```
Lease (Pachtvertrag)
 ├── Person (Verpaechter) ─── Natuerliche oder juristische Person
 ├── LeasePlot (n:m) ─── Verknuepfung zu Flurstuecken
 │    └── Plot (Flurstueck)
 │         ├── county / municipality / cadastralDistrict / fieldNumber / plotNumber
 │         └── PlotArea (1:n) ─── Teilflaechen
 │              ├── WEA_STANDORT ─── % vom Ertrag
 │              ├── POOL ─── % vom Ertrag (Pool-Flaeche)
 │              ├── WEG ─── Fixbetrag pro qm (Zuwegung)
 │              ├── AUSGLEICH ─── Fixbetrag pro qm
 │              └── KABEL ─── Fixbetrag pro Meter (Kabeltrasse)
 └── LeaseSettlementPeriod ─── Pachtabrechnungen (Vorschuss / Endabrechnung)
```

### 5.4 Energie-Modul (SCADA + Abrechnungen)

#### Datenmodell-Trennung (KRITISCH)

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

- **ScadaMeasurement**: 10-Minuten-Rohdaten aus Enercon WSD/UID-Dateien
- **TurbineProduction**: Reine Produktionsdaten (kWh, Betriebsstunden, Verfuegbarkeit) - KEIN Umsatz!
- **EnergySettlement**: Netzbetreiber-/Direktvermarkter-Abrechnungsdaten (Einspeisung + Erloes)
- **Invoice** (geplant): Gutschriften an Gesellschafter - komplexes Modul, spaeterer Meilenstein

#### SCADA-Integration (Enercon)

```
Enercon SCADA-Verzeichnis:
  Loc_XXXX/              ─── Standort (Location Code)
   └── YYYY/             ─── Jahr
       └── MM/           ─── Monat
           └── YYYYMMDD.wsd  ─── Tages-Datei (dBASE III Format)
               YYYYMMDD.uid  ─── Elektrische Daten

ScadaTurbineMapping:
  locationCode + plantNo ──► turbineId
  (Zuordnung Enercon-Kennung zu DB-Turbine)
```

Wichtige WSD-Feldnamen:
- `Date` + `Hour` + `Minute` + `Second` = Zeitstempel (muessen kombiniert werden!)
- `mrwSmpVWi` = Windgeschwindigkeit (m/s)
- `mrwSmpP` = Leistung in **kW** (nicht Watt!)
- `mrwSmpNRot` = Rotor-Drehzahl (U/min)
- `mrwAbGoPos` = Gondel-Position / Windrichtung (Grad)
- Ungueltige Werte: 32767, 65535, 6553.5

#### Strom-Verteilungskonzept (DULDUNG)

```
NB-Gutschrift (Netzbetreiber)
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

**DULDUNGS-Formel:**
- Ausgleich = (Ist-Produktion - Durchschnitt) × Verguetungssatz
- Positiv = Abzug (WKA produzierte mehr als Durchschnitt)
- Negativ = Zuschlag (WKA produzierte weniger)
- Bei TOLERATED: Nur Abweichungen ueber der Toleranzgrenze werden ausgeglichen

### 5.5 Rechnungswesen

```
Invoice (Rechnung / Gutschrift)
 ├── InvoiceType: INVOICE | CREDIT_NOTE
 ├── InvoiceItem (1:n) ─── Positionen mit DATEV-Konten
 │    ├── datevKonto, datevGegenkonto, datevKostenstelle
 │    └── taxType: STANDARD (19%) | REDUCED (7%) | EXEMPT (0%)
 ├── Storno: cancelledInvoiceId (Self-Relation)
 ├── PDF-Generierung mit Briefkopf (Letterhead)
 ├── InvoiceNumberSequence ─── Fortlaufende Nummern pro Typ/Mandant
 └── Soft-Delete: deletedAt (10-Jahre Aufbewahrungspflicht, AO §147 / HGB §257)

Distribution (Ausschuettung)
 ├── DistributionItem (1:n) ─── pro Gesellschafter
 │    ├── percentage + amount
 │    └── invoiceId ─── generierte Gutschrift (1:1)
 └── status: DRAFT → EXECUTED → (CANCELLED)

LeaseSettlementPeriod (Pachtabrechnung)
 ├── periodType: ADVANCE | FINAL
 ├── totalRevenue, totalMinimumRent, totalActualRent
 └── linkedEnergySettlementId ─── Verknuepfung zu Strom-Abrechnung
```

### 5.6 Abstimmungen (Votes)

```
Vote (Gesellschafterbeschluss)
 ├── voteType: simple (Ja/Nein/Enthaltung) oder custom
 ├── quorumPercentage + requiresCapitalMajority
 ├── status: DRAFT → ACTIVE → CLOSED
 ├── VoteResponse (1:n) ─── Stimmabgabe pro Gesellschafter
 └── VoteProxy ─── Stimmrechtsvertretung (mit validFrom/validUntil)
```

### 5.7 Dokumente

```
Document
 ├── category: CONTRACT | PROTOCOL | REPORT | INVOICE | PERMIT | CORRESPONDENCE | OTHER
 ├── Versionierung: parentId (Self-Relation) + versions[]
 ├── Tags-Array fuer Kategorisierung
 ├── Optionale Zuordnung: Park, Turbine, Fund, Contract, Shareholder, ServiceEvent
 └── isArchived (Soft-Archive)

DocumentTemplate ─── Dokumentvorlagen pro Typ/Park
Letterhead ─── Briefkoepfe pro Park (Logo, Absender, Fusszeile)
```

## 6. Datenfluss

### 6.1 Authentifizierung
```
User → Login-Form → NextAuth.js Credentials Provider → bcrypt-Vergleich
→ JWT mit tenantId/role → Session → Datenzugriff via Prisma
```

### 6.2 SCADA-Import
```
Admin waehlt Verzeichnis → Browse-API liest Enercon-Ordnerstruktur
→ Preview zeigt Dateien + Zuordnung → Import-API parst dBASE III (.wsd/.uid)
→ ScadaTurbineMapping ordnet PlantNo → Turbine zu
→ ScadaMeasurement-Eintraege (10-Min) → Aggregation zu TurbineProduction (Monat)
```

### 6.3 Energie-Abrechnung
```
TurbineProduction-Daten vorhanden → Neue EnergySettlement anlegen (Park/Jahr/Monat)
→ NB-Gutschrift-Betrag eingeben → Berechnung nach Verteilmodus
→ EnergySettlementItems pro Betreibergesellschaft
→ (zukuenftig: automatische Gutschrift-Erzeugung pro Fund)
```

### 6.4 Pachtabrechnung
```
LeaseSettlementPeriod anlegen → Produktionsdaten aggregieren
→ Pachtberechnung pro Flurstueck (WEA-%, Pool-%, Fixbetraege)
→ Mindestpacht-Pruefung → Invoice-Generierung → PDF → E-Mail
```

### 6.5 Dokumenten-Upload
```
User → Upload-Form → API-Route → Validierung → Dateisystem/MinIO (S3)
→ Prisma DB-Eintrag → Audit-Log
```

## 7. Sicherheitskonzept

### 7.1 Authentifizierung & Autorisierung
- **JWT-Token** (NextAuth.js v5) mit 24h Laufzeit
- **Application-Level Tenant Isolation** durch tenantId-Filter in allen Prisma-Queries
- **RBAC** mit editierbaren Rollen und granularen Permissions
- **Resource Access**: Datensatz-Level Berechtigungen
- **Permission-Cache**: In-Memory-Cache
- **Impersonation**: SuperAdmin kann als anderer User agieren (mit Audit-Log)

### 7.2 Datensicherheit
- **Verschluesselung**: TLS 1.3 fuer Transport
- **Passwort-Hashing**: bcryptjs
- **Audit-Log**: Alle Aenderungen werden protokolliert (AuditLog-Tabelle)
- **Backup**: PostgreSQL-Backups mit pg_dump (on-demand und automatisch)
- **DSGVO-konform**: Datenexport, Loeschfunktion
- **Aufbewahrungspflicht**: Rechnungen mit Soft-Delete (10 Jahre, AO §147)

### 7.3 Input-Validierung
- Server-seitige Validierung mit Zod-Schemas in jeder API-Route
- Prisma Parameterized Queries (SQL Injection Prevention)
- XSS-Schutz durch React-Escaping + isomorphic-dompurify fuer HTML-Content
- CSRF-Schutz durch NextAuth.js

## 8. Datenmodell

### 8.1 Entity-Relationship Uebersicht

```
┌──────────┐    1:n    ┌──────────┐    1:n    ┌──────────┐    1:n    ┌─────────────────┐
│  Tenant  │──────────▶│   Park   │──────────▶│ Turbine  │──────────▶│ScadaMeasurement │
└──────────┘           └────┬─────┘           └────┬─────┘           └─────────────────┘
                            │                      │
                            │ 1:n                  │ 1:n
                            ▼                      ▼
                     ┌──────────┐          ┌──────────────────┐
                     │   Plot   │          │TurbineProduction │
                     │(Flurstk.)│          │ (Monatsdaten)    │
                     └────┬─────┘          └──────────────────┘
                          │
                ┌─────────┼─────────┐
                │ n:m               │ 1:n
                ▼                   ▼
         ┌──────────┐       ┌──────────┐
         │  Lease   │       │ PlotArea │
         │ (Pacht)  │       │(Teilfl.) │
         └────┬─────┘       └──────────┘
              │ n:1
              ▼
         ┌──────────┐
         │  Person  │
         │(Verpaech)│
         └──────────┘

┌──────────┐    1:n    ┌──────────────┐    1:n    ┌──────────────────────┐
│   Fund   │──────────▶│ Shareholder  │──────────▶│    VoteResponse      │
│(Gesellsch│           └──────┬───────┘           └──────────────────────┘
│  aft)    │                  │ opt.
└────┬─────┘                  ▼
     │                 ┌──────────┐
     │ 1:n             │   User   │ (Portal-Zugang)
     ▼                 └──────────┘
┌──────────────────┐
│EnergySettlement  │    1:n    ┌──────────────────────┐
│(NB-Abrechnung)   │──────────▶│EnergySettlementItem  │
└──────────────────┘           │(pro Betreiber-Fund)  │
                               └──────────────────────┘

n:m Beziehungen:
  Fund ◄──FundPark──► Park
  Lease ◄──LeasePlot──► Plot
  Role ◄──RolePermission──► Permission
  Fund ◄──FundHierarchy──► Fund (Mutter/Tochter)
```

### 8.2 Alle Modelle (38 Stueck)

| Bereich | Modelle |
|---------|---------|
| Kern | Tenant, User, Account, Session, VerificationToken, PasswordResetToken |
| Parks & Anlagen | Park, Turbine, ParkRevenuePhase, ServiceEvent |
| Gesellschaften | Fund, FundPark, FundHierarchy, Person, Shareholder |
| Pacht & Flaechen | Lease, LeasePlot, Plot, PlotArea |
| Vertraege & Dokumente | Contract, Document, DocumentTemplate |
| Rechnungswesen | Invoice, InvoiceItem, InvoiceNumberSequence, Distribution, DistributionItem |
| Abstimmungen | Vote, VoteResponse, VoteProxy |
| Energie | EnergySettlement, EnergySettlementItem, EnergyRevenueType, EnergyMonthlyRate, TurbineProduction, TurbineOperator, ScadaTurbineMapping |
| SCADA | ScadaMeasurement, ScadaImportLog |
| System | Notification, News, WeatherData, AuditLog, GeneratedReport, EnergyReportConfig, LeaseSettlementPeriod |
| Berechtigungen | Permission, Role, RolePermission, UserRoleAssignment, ResourceAccess |
| Admin | Letterhead, EmailTemplate, BillingRule, BillingRuleExecution, SystemConfig, InvoiceItemTemplate |

### 8.3 Wichtige Enums (17 Stueck)

| Enum | Werte |
|------|-------|
| UserRole | SUPERADMIN, ADMIN, MANAGER, VIEWER |
| EntityStatus | ACTIVE, INACTIVE, ARCHIVED |
| FundType | BETREIBER, NETZGESELLSCHAFT, UMSPANNWERK, VERMARKTUNG, SONSTIGE |
| DistributionMode | PROPORTIONAL, SMOOTHED, TOLERATED |
| ContractType | LEASE, SERVICE, INSURANCE, GRID_CONNECTION, MARKETING, OTHER |
| ContractStatus | DRAFT, ACTIVE, EXPIRING, EXPIRED, TERMINATED |
| InvoiceType | INVOICE, CREDIT_NOTE |
| InvoiceStatus | DRAFT, SENT, PAID, CANCELLED |
| TaxType | STANDARD (19%), REDUCED (7%), EXEMPT (0%) |
| ProductionDataSource | MANUAL, CSV_IMPORT, EXCEL_IMPORT, SCADA |
| ProductionStatus | DRAFT, CONFIRMED, INVOICED |
| EnergySettlementStatus | DRAFT, CALCULATED, INVOICED, CLOSED |
| SettlementPeriodStatus | OPEN, IN_PROGRESS, CLOSED |
| DistributionStatus | DRAFT, EXECUTED, CANCELLED |
| PlotAreaType | WEA_STANDORT, POOL, WEG, AUSGLEICH, KABEL |
| BillingRuleFrequency | MONTHLY, QUARTERLY, SEMI_ANNUAL, ANNUAL, CUSTOM_CRON |
| ReportType | MONTHLY, ANNUAL, SHAREHOLDERS, SETTLEMENT, CONTRACTS, INVOICES, ... |

### 8.4 Wichtige Datenmuster

- **Multi-Tenancy**: Jede Kerntabelle hat `tenantId` FK mit `onDelete: Cascade`
- **Soft-Delete bei Rechnungen**: `deletedAt` fuer 10-Jahre Aufbewahrungspflicht
- **Historische Nachverfolgung**: TurbineOperator und FundHierarchy mit `validFrom`/`validTo`
- **Dokumenten-Versionierung**: Self-Relation ueber `parentId`
- **Composite Unique Keys**: z.B. `[turbineId, year, month, tenantId]` bei TurbineProduction
- **Dezimal-Praezision**: Finanzen `Decimal(15,2)`, Prozente `Decimal(5,2)`, Koordinaten `Decimal(10,8)`
- **DATEV-Integration**: Felder fuer Buchungsschluessel, Konten, Kostenstellen auf InvoiceItem

## 9. Navigation & Seitenstruktur

### 9.1 Hauptanwendung (Dashboard)

```
Sidebar-Navigation
├── Dashboard (/dashboard)
│
├── Windparks
│   ├── Parks (/parks) ─── parks:read
│   └── Service-Events (/service-events) ─── service-events:read
│
├── Finanzen
│   ├── Rechnungen (/invoices) ─── invoices:read
│   ├── Vertraege (/contracts) ─── contracts:read
│   ├── Beteiligungen (/funds) ─── funds:read
│   └── Energie (/energy) ─── energy:read [aufklappbar]
│       ├── Uebersicht (/energy)
│       ├── Produktionsdaten (/energy/productions)
│       ├── Netzbetreiber-Daten (/energy/settlements)
│       ├── SCADA-Messdaten (/energy/scada/data)
│       ├── SCADA-Analyse (/energy/analysis)
│       ├── SCADA-Vergleich (/energy/scada/comparison)
│       ├── SCADA-Zuordnung (/energy/scada)
│       └── Berichte (/energy/reports)
│
├── Verwaltung
│   ├── Pacht (/leases) ─── leases:read [aufklappbar]
│   │   ├── Pachtvertraege (/leases)
│   │   └── Zahlungen (/leases/payments)
│   ├── Dokumente (/documents) ─── documents:read
│   ├── Abstimmungen (/votes) ─── votes:read
│   ├── Meldungen (/news)
│   └── Berichte (/reports) ─── reports:read [aufklappbar]
│       ├── Berichte erstellen (/reports)
│       └── Berichtsarchiv (/reports/archive)
│
├── Administration (ab ADMIN)
│   ├── Einstellungen (/settings) ─── settings:read
│   ├── Abrechnungsperioden (/admin/settlement-periods)
│   ├── Abrechnungsregeln (/admin/billing-rules)
│   ├── Zugriffsreport (/admin/access-report)
│   └── E-Mail-Vorlagen (/admin/email)
│
└── System (nur SUPERADMIN)
    ├── Admin-Uebersicht (/admin)
    ├── Benutzer (/admin/settings)
    ├── System-Gesundheit (/admin/system)
    ├── System-Konfiguration (/admin/system-config)
    ├── Audit-Logs (/admin/audit-logs)
    ├── Rollen & Rechte (/admin/roles)
    ├── Backup & Speicher (/admin/backup)
    └── SuperAdmin-Einstellungen (/admin/system-settings)
```

### 9.2 Gesellschafter-Portal

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
└── Einstellungen (/portal/settings)
```

## 10. API-Uebersicht

177+ REST-Endpunkte, organisiert in 27+ Module:

| Modul | Endpunkte | Beschreibung |
|-------|-----------|--------------|
| `/api/parks` | 2 Routes | CRUD fuer Windparks |
| `/api/turbines` | 2 Routes | CRUD fuer Turbinen |
| `/api/funds` | 8 Routes | Gesellschaften, Hierarchie, Ausschuettungen |
| `/api/shareholders` | 2 Routes | Gesellschafter inkl. Portal-Zugang |
| `/api/persons` | 2 Routes | Natuerliche/juristische Personen |
| `/api/leases` | 4 Routes | Pachtvertraege, Flurstueck-Zuordnung, Zahlungen |
| `/api/plots` | 3 Routes | Flurstuecke mit Teilflaechen |
| `/api/contracts` | 3 Routes | Vertraege mit Dokumenten |
| `/api/documents` | 6 Routes | Dokumente, Versionen, Download, Suche |
| `/api/invoices` | 8 Routes | Rechnungen, Positionen, PDF, Storno, Versand |
| `/api/energy/productions` | 5 Routes | Produktionsdaten, Import, CSV-Vorlagen |
| `/api/energy/settlements` | 4 Routes | NB-Abrechnungen, Berechnung, Gutschriften |
| `/api/energy/scada` | 10 Routes | Browse, Scan, Import, Mappings, Messdaten, Analyse |
| `/api/energy/reports` | 3 Routes | Energieberichte, Konfigurationen |
| `/api/votes` | 3 Routes | Abstimmungen mit Export |
| `/api/proxies` | 3 Routes | Stimmrechtsvertretung |
| `/api/news` | 2 Routes | Meldungen |
| `/api/service-events` | 2 Routes | Wartungsereignisse |
| `/api/reports` | 3 Routes | Berichte, Archiv |
| `/api/weather` | 2 Routes | Wetterdaten pro Park |
| `/api/portal` | 9 Routes | Gesellschafter-Portal (readonly) |
| `/api/admin` | 40+ Routes | User-, Rollen-, System-Verwaltung, Billing, Backup |
| `/api/auth` | 4 Routes | Login, Passwort-Reset, Berechtigungen |
| `/api/user` | 5 Routes | Profil, Einstellungen, Avatar, Dashboard-Config |
| `/api/dashboard` | 3 Routes | Dashboard-Statistiken und Widgets |

## 11. Skalierbarkeit & Performance

### Horizontale Skalierung

```
                    ┌─────────────┐
                    │   Traefik   │
                    │   (LB)      │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐    ┌─────────┐    ┌─────────┐
      │ App #1  │    │ App #2  │    │ App #3  │
      └─────────┘    └─────────┘    └─────────┘
           │               │               │
           └───────────────┼───────────────┘
                           ▼
           ┌───────────────────────────────┐
           │       PostgreSQL 16           │
           │   (Connection Pooling via     │
           │    Prisma)                    │
           └───────────────────────────────┘
```

### Performance-Optimierungen
- **Caching**: Redis fuer Permission-Cache und haeufige Abfragen
- **Database**: Connection Pooling via Prisma, umfangreiche Indexierung (50+ Indexes im Schema)
- **Lazy Loading**: Code-Splitting via Next.js + dynamische Imports fuer schwere Komponenten
- **Background Processing**: BullMQ Worker fuer rechenintensive Aufgaben
- **Pagination**: Alle Listen-Endpunkte mit Offset/Limit-Pagination
- **Aggregationen**: Prisma aggregate() fuer Summen/Statistiken statt Client-Berechnung

## 12. Docker-Container-Struktur

```yaml
services:
  app:           # Next.js 15 Application
  worker:        # BullMQ Worker (Background Jobs)
  postgres:      # PostgreSQL 16 Database
  redis:         # Redis 7 - Cache, Sessions, BullMQ Queue
  minio:         # MinIO (S3-kompatibel) fuer Dokumente
  minio-init:    # MinIO Bucket-Initialisierung
  traefik:       # Reverse Proxy & SSL Termination
  backup:        # PostgreSQL Backup-Container (on-demand)
```

## 13. Entwicklungsumgebung vs. Produktion

| Aspekt | Development | Production |
|--------|-------------|------------|
| Database | Lokale PostgreSQL 16 (Docker) | PostgreSQL 16 (Docker / Self-hosted) |
| ORM | Prisma mit `prisma migrate dev` | Prisma mit `prisma migrate deploy` |
| Storage | Lokales Dateisystem / MinIO | MinIO (S3-kompatibel, Docker) |
| Auth | NextAuth.js v5 (JWT, Credentials) | NextAuth.js v5 (JWT, Credentials) |
| Mail | Mailhog (Fake-SMTP auf Port 8025) | SMTP (konfigurierbar pro Mandant) |
| SSL | Kein SSL (localhost) | Let's Encrypt (via Traefik) |
| Worker | `tsx watch` (Hot-Reload) | BullMQ Worker (mehrere Replicas) |
| Logging | pino-pretty (formatiert) | Pino JSON (strukturiert) |
| Error Tracking | Console | Sentry |

## 14. Monitoring & Logging

- **Application Monitoring**: Sentry (@sentry/nextjs) fuer Error-Tracking und Performance
- **Infrastructure**: Docker Health Checks fuer alle Services
- **Logging**: Strukturiertes JSON-Logging mit Pino (Slow-Query-Warnung bei >100ms)
- **Health Checks**: `/api/health` Endpoint
- **Alerting**: Discord/Slack Webhooks bei Fehlern (via Sentry)
- **Audit-Trail**: Alle Datenaenderungen in AuditLog-Tabelle
- **System-Metriken**: `/api/admin/metrics` fuer SuperAdmin

## 15. Zukuenftige Module (geplant)

### 15.1 Invoice-Modul (Gutschriften an Gesellschafter)
- Automatische Gutschrift-Erzeugung aus EnergySettlement
- Pachtabrechnungs-Gutschriften aus LeaseSettlementPeriod
- Integration mit DATEV-Export
- PDF-Generierung mit mandantenspezifischen Briefkoepfen

### 15.2 Erweiterte Pachtabrechnung
- Automatische Vorschussberechnung basierend auf historischen Daten
- Endabrechnung mit tatsaechlichen Produktionsdaten
- Integration der DULDUNGS-Berechnung in Pachtabrechnungen

### 15.3 Weitere SCADA-Hersteller
- Erweiterung des Parsers fuer Vestas, Siemens Gamesa, Nordex
- Generischer CSV/XML-Import fuer beliebige SCADA-Systeme

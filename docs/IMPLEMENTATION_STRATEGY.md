# WPM Implementation Strategy

> Umsetzungsstrategie für neue Features — Stand: 26.02.2026

---

## Inhaltsverzeichnis

1. [Architektur-Überblick](#architektur-überblick)
2. [K1: Ausschüttungsmodul](#k1-ausschüttungsmodul)
3. [A1: Leistungskurven-Analyse](#a1-leistungskurven-analyse)
4. [K2: Serienbriefe / Mailing](#k2-serienbriefe--mailing)
5. [A2: Komponentenverwaltung + Wartung](#a2-komponentenverwaltung--wartung)
6. [U2: Benachrichtigungs-Center](#u2-benachrichtigungs-center)
7. [K3: Redispatch 2.0](#k3-redispatch-20)
8. [A4: Echtzeit-Status-Dashboard](#a4-echtzeit-status-dashboard)
9. [U1: Mobile Inspektion](#u1-mobile-inspektion)
10. [I2: Banking / SEPA](#i2-banking--sepa)
11. [Technische Schulden](#technische-schulden)
12. [Abhängigkeitsgraph](#abhängigkeitsgraph)

---

## Architektur-Überblick

### Bestehende Bausteine die wir wiederverwenden

| Baustein | Was existiert | Wo |
|----------|---------------|-----|
| **Shareholders** | Kommanditisten mit Anteilen, Einlagen, Stimmrechten | `prisma/schema.prisma:419` |
| **Funds** | Gesellschaften mit Kapital, Bankverbindung, Hierarchien | `prisma/schema.prisma:320` |
| **Invoices** | Rechnungen mit PDF, Skonto, Status-Workflow | `prisma/schema.prisma:693` |
| **PDF-Generator** | 8 Generatoren (Invoice, Report, Settlement, etc.) | `src/lib/pdf/generators/` |
| **E-Mail-System** | 15 Templates, SMTP/SendGrid/SES, Queue mit Retry | `src/lib/email/` |
| **BullMQ Queues** | 8 Queues (Email, PDF, Billing, Weather, etc.) | `src/lib/queue/queues/` |
| **Reminder-Service** | Tägliche Prüfung auf Fälligkeiten + E-Mail | `src/lib/reminders/` |
| **Dashboard Widgets** | 35+ Widgets, 12-Spalten Grid, rollenbasiert | `src/lib/dashboard/widget-registry.ts` |
| **SCADA-Daten** | Enercon WSD/UID, ScadaMeasurement, TurbineProduction | `prisma/schema.prisma:1954` |
| **Feature Flags** | Toggle-System mit DB-Config + `useFeatureFlags()` | `src/lib/config/index.ts` |

### Standard-Implementierungsmuster

Jedes neue Feature folgt diesem Schema:

```
1. Prisma Schema    → Neue Modelle/Felder + `prisma db push`
2. API Routes       → CRUD unter `src/app/api/...`
3. Business Logic   → Service-Layer unter `src/lib/...`
4. Queue/Worker     → Falls async (PDF, E-Mail, Berechnungen)
5. Frontend Page    → Unter `src/app/(dashboard)/...`
6. Dashboard Widget → Widget-Registry erweitern
7. Sidebar + i18n   → Navigation + Übersetzungen
8. Tests            → TypeScript-Check + manueller Test
```

---

## K1: Ausschüttungsmodul

**Ziel:** Gewinn eines Windparks anteilsmäßig an Gesellschafter verteilen
**Aufwand:** 1-2 Tage | **Impact:** Sehr hoch

### Geschäftslogik

```
Jahresgewinn des Funds
  - Betriebskosten (Pacht, Wartung, BF-Gebühr, Versicherung)
  - Rücklagen (optional)
  = Ausschüttbarer Betrag

  → Pro Gesellschafter:
    Ausschüttbarer Betrag × distributionPercentage%
    - bereits geleistete Vorab-Entnahmen
    = Auszahlungsbetrag
```

### Prisma Schema

```prisma
model Distribution {
  id                String   @id @default(cuid())
  tenantId          String
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  fundId            String
  fund              Fund     @relation(fields: [fundId], references: [id])
  year              Int
  title             String               // "Ausschüttung 2024"
  totalAmount       Decimal              // Gesamtbetrag
  deductions        Json?                // { betriebskosten, ruecklagen, ... }
  distributableAmount Decimal            // Nach Abzügen
  status            DistributionStatus   // DRAFT → APPROVED → PAID
  approvedAt        DateTime?
  approvedBy        String?
  notes             String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  items             DistributionItem[]

  @@map("distributions")
}

model DistributionItem {
  id                String   @id @default(cuid())
  distributionId    String
  distribution      Distribution @relation(fields: [distributionId], references: [id])
  shareholderId     String
  shareholder       Shareholder  @relation(fields: [shareholderId], references: [id])
  ownershipPct      Decimal              // Anteil zum Zeitpunkt
  grossAmount       Decimal              // Brutto-Anteil
  taxAmount         Decimal @default(0)  // KapESt falls zutreffend
  netAmount         Decimal              // Netto-Auszahlung
  priorWithdrawals  Decimal @default(0)  // Bereits erhaltene Vorab-Entnahmen
  finalAmount       Decimal              // Tatsächliche Auszahlung
  invoiceId         String?              // Verknüpfung zur Gutschrift
  invoice           Invoice? @relation(fields: [invoiceId], references: [id])
  status            String   @default("PENDING") // PENDING → INVOICED → PAID
  createdAt         DateTime @default(now())

  @@map("distribution_items")
}

enum DistributionStatus {
  DRAFT
  APPROVED
  PAID
  CANCELLED
}
```

### API Routes

| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/api/distributions` | Liste aller Ausschüttungen (Filter: Fund, Jahr, Status) |
| POST | `/api/distributions` | Neue Ausschüttung erstellen (berechnet automatisch Items) |
| GET | `/api/distributions/[id]` | Detail mit Items + Gesellschafter-Aufschlüsselung |
| PATCH | `/api/distributions/[id]` | Status ändern (DRAFT → APPROVED) |
| POST | `/api/distributions/[id]/generate-invoices` | Gutschriften für alle Items generieren |
| GET | `/api/distributions/preview` | Vorschau-Berechnung (ohne Speichern) |

### Service-Layer

```
src/lib/distributions/
  ├── index.ts                    # Re-exports
  ├── distribution-service.ts     # Berechnungslogik
  └── distribution-calculator.ts  # Anteilsberechnung
```

**Kern-Funktion `calculateDistribution(fundId, year)`:**
1. Lade alle Shareholders des Funds mit `distributionPercentage`
2. Lade Einnahmen (EnergySettlement-Summe für den Fund/Jahr)
3. Lade Ausgaben (Pachtzahlungen, BF-Kosten, Versicherung)
4. Berechne: Einnahmen - Ausgaben - Rücklagen = ausschüttbar
5. Pro Shareholder: ausschüttbar × Anteil% - Vorab-Entnahmen

### Frontend

```
src/app/(dashboard)/distributions/
  ├── page.tsx                    # Übersicht aller Ausschüttungen
  └── [id]/page.tsx               # Detail mit Gesellschafter-Tabelle

src/components/distributions/
  ├── distribution-wizard.tsx     # Schritt-für-Schritt Erstellung
  ├── distribution-preview.tsx    # Vorschau-Berechnung
  └── distribution-item-table.tsx # Aufschlüsselung pro Gesellschafter
```

### Dashboard Widget
- `kpi-distributions` — Letzte Ausschüttung, Gesamtvolumen dieses Jahr
- Kategorie: KPI (3×2), minRole: MANAGER

### Sidebar
- Unter "Finanzen" → "Ausschüttungen" (`/distributions`, icon: `Coins`)
- Permission: `distributions:read`

---

## A1: Leistungskurven-Analyse

**Ziel:** Hersteller-Sollkurve vs. tatsächliche SCADA-Daten visualisieren
**Aufwand:** 1-2 Tage | **Impact:** Hoch

### Prisma Schema

```prisma
model PowerCurve {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  name            String               // "Enercon E-82 2.0MW"
  manufacturer    String               // "Enercon"
  model           String               // "E-82"
  ratedPowerKw    Decimal              // 2000
  dataPoints      Json                 // [{ windSpeed: 3, power: 25 }, { windSpeed: 4, power: 82 }, ...]
  source          String?              // "Herstellerdatenblatt", "IEC gemessen"
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  turbines        Turbine[]            // Zugeordnete Anlagen

  @@map("power_curves")
}

// Feld am Turbine-Model hinzufügen:
// powerCurveId  String?
// powerCurve    PowerCurve? @relation(...)
```

### API Routes

| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/api/power-curves` | Alle Leistungskurven |
| POST | `/api/power-curves` | Neue Kurve anlegen (manuell oder CSV-Import) |
| POST | `/api/power-curves/import` | CSV-Import (Spalten: wind_speed, power_kw) |
| GET | `/api/energy/analytics/power-curve` | Scatter-Daten: SCADA-Messpunkte + Sollkurve |

### Analyse-Logik

```
src/lib/energy/power-curve-analysis.ts
```

**Query für Scatter-Plot:**
```sql
SELECT
  "mrwSmpVWi" as wind_speed,      -- Windgeschwindigkeit (m/s)
  "mrwSmpP" as power_kw,          -- Leistung (kW)
  "timestamp"
FROM scada_measurements
WHERE turbine_id = ? AND timestamp BETWEEN ? AND ?
  AND "mrwSmpVWi" > 0 AND "mrwSmpP" >= 0      -- Nur gültige Werte
  AND "mrwSmpVWi" NOT IN (32767, 65535)         -- Ungültige Messwerte filtern
```

**Performance-Index:**
```
PI = Σ(Ist-Produktion in Bin) / Σ(Soll-Produktion in Bin) × 100%

Bins: 0.5 m/s Intervalle (z.B. 3.0-3.5, 3.5-4.0, ...)
Soll pro Bin = Anzahl Messpunkte × Soll-Leistung(Bin-Mitte)
```

### Frontend

```
src/app/(dashboard)/energy/analytics/power-curve/page.tsx
```

**Komponenten:**
- Scatter-Plot (recharts): X=Windgeschwindigkeit, Y=Leistung
  - Blaue Punkte = SCADA-Messwerte
  - Rote Linie = Hersteller-Sollkurve
- Zeitraum-Wähler (Monat/Quartal/Jahr)
- Turbine-Selector (Dropdown)
- Performance-Index Anzeige (z.B. "97.3%")
- Tabelle: Abweichung pro Wind-Bin

### Dashboard Widget
- `chart-power-curve` — Mini-Scatter mit PI-Wert
- Kategorie: Chart (6×6), minRole: MANAGER

---

## K2: Serienbriefe / Mailing ✅ FERTIG

**Ziel:** Vorlagen-basierte Massenkommunikation an Gesellschafter
**Aufwand:** 2-3 Tage | **Impact:** Hoch | **Umgesetzt:** 26.02.2026

### Umgesetzt

- **3 Prisma Models:** `MailingTemplate`, `Mailing`, `MailingRecipient` + 2 Enums (`MailingCategory`, `MailingStatus`)
- **6 API Routes:** Templates CRUD, Mailings CRUD, Send, Preview
- **Platzhalter-Service:** `src/lib/mailings/placeholder-service.ts` — 8 Standard-Platzhalter (anrede, vorname, nachname, gesellschaft, anteil, einlage, datum, gesellschafternr)
- **3-Schritt Wizard:** `src/app/(dashboard)/mailings/create/page.tsx` (Template → Empfänger → Vorschau+Senden)
- **Template-Editor:** `src/components/mailings/template-editor.tsx` (Rich-Text, Platzhalter-Insert)
- **Template-Verwaltung:** `src/app/(dashboard)/mailings/templates/page.tsx`
- **Mailing-Übersicht:** `src/app/(dashboard)/mailings/page.tsx` (Status-Badges, Empfänger-Tracking)
- **BullMQ-Integration:** Versand über bestehende Email-Queue
- **Sidebar:** "Serienbriefe" (Mail Icon) mit Children "Übersicht" + "Vorlagen"
- **Permissions:** `mailings:read`, `mailings:create`, `mailings:send`, `mailings:delete`
- **i18n:** DE + EN Keys

---

## A2: Komponentenverwaltung + Wartung

**Ziel:** Verbaute Komponenten und Wartungshistorie pro Anlage tracken
**Aufwand:** 2-3 Tage | **Impact:** Hoch

### Prisma Schema

```prisma
model TurbineComponent {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  turbineId       String
  turbine         Turbine  @relation(fields: [turbineId], references: [id])
  type            ComponentType
  manufacturer    String?              // "ZF Friedrichshafen"
  model           String?              // "AKH 82/6.3"
  serialNumber    String?
  installDate     DateTime?
  warrantyEndDate DateTime?
  status          ComponentStatus @default(ACTIVE)
  notes           String?
  maintenanceItems MaintenanceRecord[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("turbine_components")
}

model MaintenanceRecord {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  turbineId       String
  turbine         Turbine  @relation(fields: [turbineId], references: [id])
  componentId     String?
  component       TurbineComponent? @relation(fields: [componentId], references: [id])
  type            MaintenanceType      // SCHEDULED, UNSCHEDULED, INSPECTION, REPAIR
  title           String               // "Jährliche Wartung", "Getriebe-Ölwechsel"
  description     String?  @db.Text
  performedBy     String?              // Firma/Person
  performedAt     DateTime?
  scheduledFor    DateTime?            // Soll-Termin
  completedAt     DateTime?
  costEur         Decimal?
  durationHours   Decimal?
  status          MaintenanceStatus @default(PLANNED) // PLANNED → IN_PROGRESS → COMPLETED
  findings        String?  @db.Text    // Befunde
  documents       Document[]           // Prüfberichte, Fotos
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("maintenance_records")
}

enum ComponentType {
  GEARBOX         // Getriebe
  GENERATOR       // Generator
  ROTOR_BLADE     // Rotorblatt
  TRANSFORMER     // Trafo
  PITCH_SYSTEM    // Pitchsystem
  YAW_SYSTEM      // Azimut-Antrieb
  CONVERTER       // Umrichter
  TOWER           // Turm
  FOUNDATION      // Fundament
  OTHER
}

enum ComponentStatus {
  ACTIVE
  REPLACED
  DEFECTIVE
  DECOMMISSIONED
}

enum MaintenanceType {
  SCHEDULED       // Planmäßige Wartung
  UNSCHEDULED     // Außerplanmäßig
  INSPECTION      // Inspektion/Begehung
  REPAIR          // Reparatur
  REPLACEMENT     // Komponententausch
}

enum MaintenanceStatus {
  PLANNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
  OVERDUE
}
```

### Integration mit Reminder-System

In `src/lib/reminders/reminder-service.ts` erweitern:

```typescript
// Neue Kategorie: Fällige Wartungen
async function checkOverdueMaintenances(tenantId: string) {
  return prisma.maintenanceRecord.findMany({
    where: {
      tenantId,
      status: "PLANNED",
      scheduledFor: { lt: new Date() },
    },
  });
}
```

### Frontend

```
src/app/(dashboard)/maintenance/
  ├── page.tsx                    # Wartungskalender + Übersicht
  └── [id]/page.tsx               # Wartungs-Detail

// Erweiterung der bestehenden Turbine-Detailseite:
src/app/(dashboard)/parks/[id]/turbines/[turbineId]/
  └── components/                 # Tab "Komponenten" + Tab "Wartung"
```

### Dashboard Widgets
- `list-upcoming-maintenance` — Nächste 5 fällige Wartungen (4×5)
- `kpi-maintenance-overdue` — Anzahl überfälliger Wartungen (3×2)

---

## U2: Benachrichtigungs-Center ✅ FERTIG

**Ziel:** In-App Benachrichtigungen statt nur Toast-Meldungen
**Aufwand:** 1-2 Tage | **Impact:** Mittel | **Umgesetzt:** 26.02.2026

### Umgesetzt

- **Prisma Model:** `Notification` mit 5 Typen (DOCUMENT, VOTE, CONTRACT, INVOICE, SYSTEM)
- **4 API Routes:** GET list (paginiert), GET unread-count, PATCH mark-read, POST mark-all-read
- **Shared UI:** `src/lib/notifications/notification-ui.ts` (TYPE_ICON, TYPE_COLOR, TYPE_LABEL, formatRelativeTime)
- **Bell-Icon:** `src/components/layout/notification-bell.tsx` mit Badge + Popover (15 neueste)
- **Vollständige Seite:** `src/app/(dashboard)/notifications/page.tsx` mit Typ-Filter, Paginierung, "Alle gelesen"
- **Reminder-Integration:** `reminder-service.ts` erstellt Notifications bei Fälligkeiten
- **Sidebar:** Bell-Icon, `/notifications`, `nav.notifications`
- **i18n:** DE + EN Keys

---

## K3: Redispatch 2.0

**Ziel:** Abregelungen erfassen, Entschädigungen berechnen
**Aufwand:** 2-3 Tage | **Impact:** Mittel (regulatorisch relevant)

### Prisma Schema

```prisma
model CurtailmentEvent {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  parkId          String
  park            Park     @relation(fields: [parkId], references: [id])
  startTime       DateTime
  endTime         DateTime
  reason          CurtailmentReason    // REDISPATCH, FEED_IN_MANAGEMENT, GRID_CONGESTION
  affectedTurbines Turbine[]           // Welche Anlagen betroffen
  orderReference  String?              // Referenz vom Netzbetreiber
  gridOperator    String?              // Name des Netzbetreibers

  // Berechnung
  estimatedLossKwh  Decimal?           // Geschätzte entgangene Einspeisung
  compensationRate  Decimal?           // Vergütungssatz (ct/kWh)
  compensationEur   Decimal?           // Entschädigungsbetrag
  calculationMethod String?            // "Referenzertrag" oder "Spitzabrechnung"

  // Status
  status          CurtailmentStatus @default(RECORDED) // RECORDED → CALCULATED → CLAIMED → SETTLED
  claimedAt       DateTime?
  settledAt       DateTime?
  settledAmount   Decimal?

  notes           String?
  documents       Document[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("curtailment_events")
}

enum CurtailmentReason {
  REDISPATCH
  FEED_IN_MANAGEMENT
  GRID_CONGESTION
  DIRECT_MARKETING
  OTHER
}

enum CurtailmentStatus {
  RECORDED
  CALCULATED
  CLAIMED
  SETTLED
  DISPUTED
}
```

### Berechnungslogik

```
Entgangene Einspeisung (kWh) =
  Σ(Soll-Leistung(Windgeschwindigkeit) × Dauer) für jede betroffene Anlage

  → Windgeschwindigkeit aus SCADA-Daten während des Zeitraums
  → Soll-Leistung aus PowerCurve (Feature A1!)

Entschädigung (EUR) =
  Entgangene Einspeisung × EEG-Vergütungssatz (aus EnergySettlement)
```

**Wichtig:** Feature A1 (Leistungskurven) sollte vorher implementiert sein, da die Soll-Produktion für die Entschädigungsberechnung benötigt wird.

### Frontend

```
src/app/(dashboard)/energy/curtailments/
  ├── page.tsx                    # Übersicht aller Abregelungen
  └── [id]/page.tsx               # Detail mit Berechnung

src/components/energy/
  └── curtailment-calculator.tsx  # Entschädigungsberechnung
```

---

## A4: Echtzeit-Status-Dashboard

**Ziel:** Live-Ansicht aller Anlagen mit Karten-Visualisierung
**Aufwand:** 2-3 Tage | **Impact:** Mittel ("Wow-Faktor")

### Konzept

Keine neuen Modelle nötig — nutzt bestehende SCADA-Daten + Turbine-Koordinaten.

### API Route

```
GET /api/energy/live-status
```

Liefert pro Anlage:
```json
{
  "turbines": [
    {
      "id": "...",
      "designation": "WEA 1",
      "latitude": 54.123,
      "longitude": 9.456,
      "status": "RUNNING",           // RUNNING | STOPPED | MAINTENANCE | ERROR | CURTAILED
      "lastDatapoint": "2025-02-25T14:30:00Z",
      "currentWindSpeed": 7.2,       // Letzter SCADA-Wert
      "currentPower": 1450,          // kW
      "dailyProduction": 24500,      // kWh heute
      "availabilityToday": 98.5      // %
    }
  ]
}
```

### Frontend

```
src/app/(dashboard)/monitoring/page.tsx

Komponenten:
  - Karten-Ansicht (react-leaflet oder mapbox-gl)
  - Farbcodierte Marker (grün=läuft, rot=Störung, gelb=Wartung, grau=aus)
  - Klick auf Marker → Popup mit Live-Daten
  - Sidebar-Liste mit Status aller Anlagen
  - Auto-Refresh alle 60 Sekunden
```

### Dashboard Widget
- `map-turbine-status` — Mini-Karte mit Turbine-Markern (6×6)
- Klick → Vollbild-Monitoring-Seite

---

## U1: Mobile Inspektion

**Ziel:** Vor-Ort-Inspektionen per Smartphone
**Aufwand:** 3-4 Tage | **Impact:** Mittel

### Prisma Schema

```prisma
model InspectionTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  name        String               // "Jährliche Turm-Inspektion"
  category    String               // "TURM", "FUNDAMENT", "GONDEL", "ROTORBLATT"
  checkItems  Json                 // [{ id, label, type: "OK_NOK"|"TEXT"|"NUMBER"|"PHOTO", required }]
  version     Int      @default(1)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  inspections Inspection[]

  @@map("inspection_templates")
}

model Inspection {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  templateId    String
  template      InspectionTemplate @relation(fields: [templateId], references: [id])
  turbineId     String
  turbine       Turbine  @relation(fields: [turbineId], references: [id])
  inspectorId   String
  inspector     User     @relation(fields: [inspectorId], references: [id])
  scheduledFor  DateTime?
  startedAt     DateTime?
  completedAt   DateTime?
  status        InspectionStatus @default(PLANNED)
  results       Json                 // Ausgefüllte Checkliste
  findings      InspectionFinding[]
  documents     Document[]           // Fotos, PDFs
  weatherConditions Json?            // Wind, Temp zum Zeitpunkt
  notes         String?  @db.Text
  pdfReportUrl  String?              // Generierter PDF-Bericht
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@map("inspections")
}

model InspectionFinding {
  id            String   @id @default(cuid())
  inspectionId  String
  inspection    Inspection @relation(fields: [inspectionId], references: [id])
  checkItemId   String               // Referenz auf checkItems[].id
  severity      FindingSeverity      // INFO, MINOR, MAJOR, CRITICAL
  description   String
  photoUrl      String?
  recommendation String?
  followUpDate  DateTime?
  resolvedAt    DateTime?
  createdAt     DateTime @default(now())

  @@map("inspection_findings")
}

enum InspectionStatus {
  PLANNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum FindingSeverity {
  INFO
  MINOR
  MAJOR
  CRITICAL
}
```

### Mobile-Optimierung

Kein separates Framework nötig — responsive Next.js Pages:
- Touch-optimierte Buttons (min 44px)
- Kamera-Upload via `<input type="file" capture="environment">`
- Offline-Konzept: LocalStorage für angefangene Inspektionen, Sync bei Verbindung
- PWA: `next-pwa` für Add-to-Homescreen + Offline-Cache

---

## I2: Banking / SEPA

**Ziel:** SEPA-XML Export für Auszahlungen + Kontoauszug-Import
**Aufwand:** 2-3 Tage | **Impact:** Mittel

### SEPA-XML Export

```
src/lib/banking/sepa-export.ts
```

Für Ausschüttungen und Pachtzahlungen:
- SEPA Credit Transfer (pain.001.003.03) — Überweisungen
- SEPA Direct Debit (pain.008.003.02) — Lastschriften (für Umlagen)
- Bankverbindung aus Fund.bankDetails (IBAN, BIC)
- Empfänger-IBAN aus Shareholder → Person oder LeaseContract

### Kontoauszug-Import

```
src/lib/banking/statement-import.ts
```

- MT940 (Swift) und CAMT.053 (ISO 20022) Parser
- Automatischer Zahlungsabgleich: Verwendungszweck → Rechnungsnummer
- Status-Update: Invoice SENT → PAID wenn Zahlung gefunden
- Unzugeordnete Zahlungen zur manuellen Zuordnung

### Frontend

```
src/app/(dashboard)/invoices/reconciliation/  # Existiert bereits teilweise
  → Erweitern um Kontoauszug-Upload + Auto-Matching
```

---

## Bereits umgesetzte Erweiterungen (nicht in ursprünglicher Strategie)

### Paperless-ngx Integration ✅ FERTIG

**Feature-Flag-gesteuertes Addon für Dokumenten-Archivierung**
- API-Client (`src/lib/paperless/client.ts`) für Paperless-ngx REST API
- 7 API-Routes: Dokumente (CRUD, Preview, Download), Metadaten, Sync + Status
- Browser-Seite (`/documents/paperless`), Sync-Button, Auto-Archive Hooks
- Config-Form in System-Einstellungen (URL, Token, Auto-Archive)
- BullMQ Queue/Worker für Synchronisation
- Feature-Flag: `paperless` (muss aktiviert werden)

### Onboarding Product Tour ✅ FERTIG

**driver.js Integration für interaktive Produktführung**
- Tour-Definitionen (`src/lib/onboarding/tour-definitions.ts`) mit rollenbasierten Steps
- `useOnboarding` Hook mit Tour-State-Persistence via API
- Auto-Trigger für neue Benutzer, Tour-Versionierung
- Custom-Theme (`src/styles/driver-theme.css`)
- i18n-Support (DE/EN)

### Park-Wizard Vereinfachung ✅ FERTIG

- **Reduziert von 3 auf 2 Schritte:** Stammdaten → Abrechnung
- Standort-/Betreiber-Schritt entfernt (Felder bei Bedarf direkt am Park)
- Feld-Name-Fix: Unicode ü → ASCII ue (`technischeBetriebsfuehrung`) in allen APIs

### Per-Turbine Pacht-Overrides ✅ FERTIG

- **3 neue Felder am Turbine-Model:** `minimumRent`, `weaSharePercentage`, `poolSharePercentage`
- Überschreiben Park-Defaults wenn gesetzt, sonst Fallback auf Park-Wert
- Tooltip-Hinweise an allen 3 Feldern in Create/Edit Dialogen
- **Beide Calculatoren aktualisiert:**
  - `src/lib/lease-revenue/calculator.ts` — gewichteter Durchschnitt mit Fallback
  - `src/lib/settlement/calculator.ts` — gleiche Logik in beiden Funktionen

### Dashboard Footer ✅ FERTIG

- Version-Anzeige, Copyright, Links zu Impressum/Datenschutz/Cookies
- `src/components/layout/dashboard-footer.tsx`

### Cookie-Einstellungen ✅ FERTIG

- Cookie-Settings-Seite, Legal Pages um Cookies-Feld erweitert

### Scrollbar-Theming ✅ FERTIG

- Scrollbar passt sich an Dark/Light Mode an

---

## Technische Schulden

### T1: Worker-Service Container (Prio: Hoch für Produktion)

```dockerfile
# docker-compose.portainer.yml — neuer Service:
worker:
  image: ghcr.io/blubbiii/wka_verwaltung:latest
  command: ["node", "worker.js"]  # Separater Entrypoint
  environment:
    - WORKER_MODE=true
  depends_on:
    - db
    - redis
```

Neuer Entrypoint `worker.js`:
```javascript
import { startAllWorkers } from './src/lib/queue/workers';
startAllWorkers();
// Health-Check HTTP-Server auf Port 3001
```

### T2-T8: Übrige technische Schulden

Priorisiert nach Risiko:
1. **T3: Hardcoded Passwörter** — Sicherheitsrisiko, schnell umsetzbar
2. **T4: Backup-Strategie** — Datenverlust-Risiko
3. **T2: HTTPS/SSL** — Nötig für Produktionsbetrieb
4. **T7: Auto-Seed** — Convenience für Deployment
5. **T5: Prisma Config** — Zukunftssicherheit (Prisma 7)
6. **T6: CI Pipeline** — Qualitätssicherung
7. **T8: Chart-Farben** — Kosmetisch

---

## Abhängigkeitsgraph

```
                    ┌──────────────┐
                    │  K1: Aus-    │
                    │  schüttungen │──→ I2: SEPA Export
                    └──────┬───────┘    (optional)
                           │
                           │ nutzt Shareholders, Funds, Invoices
                           │
┌──────────────┐    ┌──────┴───────┐
│  A1: Leistungs│    │  K2: Serien- │
│  kurven      │    │  briefe      │
└──────┬───────┘    └──────────────┘
       │                    │
       │ SCADA-Daten        │ nutzt Email-Queue
       │                    │
       ▼                    │
┌──────────────┐            │
│  K3: Redis-  │            │
│  patch 2.0   │◄───────────┘ (Mahnung als Serienbrief)
└──────────────┘
       │
       │ Soll-Produktion
       │
┌──────┴───────┐    ┌──────────────┐    ┌──────────────┐
│  A4: Live-   │    │  A2: Kompo-  │    │  U2: Benach-  │
│  Status      │    │  nenten +    │◄───│  richtigungs- │
└──────────────┘    │  Wartung     │    │  Center       │
                    └──────┬───────┘    └──────────────┘
                           │                    ▲
                           │ Wartungstermine    │
                           ▼                    │
                    ┌──────────────┐            │
                    │  U1: Mobile  │────────────┘
                    │  Inspektion  │ erzeugt Notifications
                    └──────────────┘
```

### Empfohlene Reihenfolge

```
Sprint 1 (Woche 1-2):    K1 Ausschüttungen + A1 Leistungskurven
Sprint 2 (Woche 3-4):    K2 Serienbriefe ✅ + U2 Benachrichtigungen ✅
Sprint 3 (Woche 5-6):    A2 Komponenten/Wartung + K3 Redispatch
Sprint 4 (Woche 7-8):    A4 Live-Status + U1 Mobile Inspektion
Parallel (laufend):       T1-T8 Technische Schulden nach Bedarf
Optional:                 I2 Banking/SEPA wenn benötigt
```

---

## Konventionen für alle Features

### Dateistruktur (konsistent mit bestehendem Code)

```
Feature "xyz":
  prisma/schema.prisma          → Modelle hinzufügen
  src/lib/xyz/                  → Business Logic + Service
  src/app/api/xyz/              → API Routes
  src/app/(dashboard)/xyz/      → Frontend Pages
  src/components/xyz/           → UI Components
  src/lib/dashboard/            → Widget-Registry erweitern
  src/components/layout/sidebar → Navigation erweitern
  src/messages/de.json + en.json → i18n Keys
```

### Checkliste pro Feature

- [ ] Prisma Schema + `prisma db push` + `prisma generate`
- [ ] API Routes mit Permission-Checks (`requirePermission`)
- [ ] Service-Layer mit Tenant-Isolation
- [ ] Frontend Page mit Loading/Error States
- [ ] Dashboard Widget (optional)
- [ ] Sidebar-Eintrag + i18n Keys (de + en)
- [ ] `npx tsc --noEmit` — 0 Errors
- [ ] Git Commit

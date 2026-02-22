# Konzept: Zusammenlegung Nutzungsentgelt & Pachtabrechnung

## Ausgangslage

Aktuell gibt es zwei getrennte Systeme fuer die Pachtabrechnung:

| | Nutzungsentgelt (`/leases/usage-fees`) | Pachtabrechnung (`/leases/settlement`) |
|---|---|---|
| **Staerke** | Uebersichtliche Liste + Detail-Ansicht mit KPIs, Tabs, Steuersplit, Kostenumlage | 4-Schritt-Wizard zum Erstellen, flexible Vorschussintervalle |
| **Schwaeche** | Einfacher Erstellungs-Dialog (nur Park+Jahr) | Keine Uebersichtsseite, keine Kostenumlage, kein Steuersplit |
| **Prisma-Modell** | `LeaseRevenueSettlement` + `LeaseRevenueSettlementItem` + `ParkCostAllocation` | `LeaseSettlementPeriod` |
| **Vorschuss** | 1x pauschal pro Jahr | Monatlich / Quartalsweise / Jaehrlich |
| **Endabrechnung** | Ja (mit Vorschuss-Verrechnung) | Ja (mit Vorschuss-Verrechnung) |
| **Steuersplit** | Pool=19% MwSt, Rest=§4 Nr.12 | Nicht im Modell |
| **Kostenumlage** | Ja (ParkCostAllocation auf Betreibergesellschaften) | Nein |

**Kernproblem:** Beide berechnen im Kern dasselbe (MAX(Mindestpacht, Umsatzanteil) pro Verpachter), aber mit unterschiedlicher Vollstaendigkeit.

---

## Ziel

**Ein einziges System "Pachtabrechnung"** unter `/leases/settlement` das:
- den **Wizard** der bisherigen Pachtabrechnung zum Erstellen nutzt (4 Schritte)
- die **Uebersichtsseite** des Nutzungsentgelts als Hauptansicht hat (KPIs, Filter, Tabelle)
- die **Detail-Ansicht** des Nutzungsentgelts behaelt (Tabs: Eigentuemer-Positionen + Kostenumlage)
- **flexible Vorschussintervalle** unterstuetzt (monatlich/quartalsweise/jaehrlich)
- **Steuersplit** und **Kostenumlage** behaelt
- das vollstaendigere Datenmodell (`LeaseRevenueSettlement`) als Basis nutzt

---

## Neues Datenmodell

### Strategie: `LeaseRevenueSettlement` erweitern, `LeaseSettlementPeriod` ablosen

Das bestehende `LeaseRevenueSettlement`-Modell wird um die fehlenden Features erweitert. `LeaseSettlementPeriod` wird danach nicht mehr benutzt (aber nicht sofort geloescht — Altdaten bleiben erhalten).

### Schema-Aenderungen an `LeaseRevenueSettlement`

```prisma
model LeaseRevenueSettlement {
  // ... bestehende Felder bleiben ...

  // === NEU: Aus LeaseSettlementPeriod uebernommen ===

  // Typ: Vorschuss oder Endabrechnung
  periodType      String   @default("FINAL")   // "ADVANCE" | "FINAL"

  // Vorschuss-Intervall (nur bei periodType = "ADVANCE")
  advanceInterval String?  // "YEARLY" | "QUARTERLY" | "MONTHLY"

  // Monat (1-12 fuer monatliche/quartalweise Vorschuesse, null fuer Jahres/Final)
  month           Int?

  // Verknuepfung zur Stromabrechnung (fuer automatische Umsatz-Uebernahme)
  linkedEnergySettlementId String?

  // Approval-Workflow (aus LeaseSettlementPeriod)
  reviewedById    String?
  reviewedBy      User?     @relation("LeaseRevenueSettlementReviewedBy", ...)
  reviewedAt      DateTime?
  reviewNotes     String?

  // Notizen
  notes           String?

  // === Unique Constraint anpassen ===
  // ALT:  @@unique([tenantId, parkId, year])
  // NEU:  @@unique([tenantId, parkId, year, periodType, month])
  // Damit pro Park+Jahr mehrere Perioden moeglich sind:
  //   - 1x FINAL (month=null)
  //   - 12x ADVANCE/MONTHLY (month=1..12)
  //   - 4x ADVANCE/QUARTERLY (month=1,4,7,10)
  //   - 1x ADVANCE/YEARLY (month=null)
}
```

### Status-Enum erweitern

```prisma
enum LeaseRevenueSettlementStatus {
  OPEN              // Erstellt, noch nicht berechnet
  CALCULATED        // Berechnung durchgefuehrt
  ADVANCE_CREATED   // Vorschuss-Gutschriften erzeugt (nur FINAL)
  SETTLED           // Endabrechnung-Gutschriften erzeugt
  PENDING_REVIEW    // Zur Pruefung vorgelegt (NEU - aus Settlement)
  APPROVED          // Freigegeben (NEU - aus Settlement)
  CLOSED            // Abgeschlossen
  CANCELLED         // Storniert
}
```

### Neues Feld an `LeaseRevenueSettlementItem`

```prisma
model LeaseRevenueSettlementItem {
  // ... bestehende Felder bleiben ...

  // NEU: Verknuepfung zu erzeugten Rechnungen (auch fuer Vorschuesse)
  invoices Invoice[] @relation("SettlementItemInvoices")
}
```

### Keine Aenderungen an:
- `ParkCostAllocation` / `ParkCostAllocationItem` — bleiben wie sie sind
- `ParkRevenuePhase` — bleibt wie es ist
- `Park`-Felder (minimumRentPerTurbine, weaSharePercentage, etc.) — bleiben

---

## UI-Konzept

### Seitenstruktur (eine Seite statt zwei)

```
/leases/settlement                    → Uebersichtsseite (Liste + KPIs)
/leases/settlement/new                → Wizard (4 Schritte)
/leases/settlement/[id]               → Detail-Ansicht
/leases/settlement/[id]/allocations   → Kostenumlage (optional eigene Seite)
```

**Entfaellt:**
- `/leases/usage-fees` (komplett)
- Sidebar-Eintrag "Nutzungsentgelt" (wird zu "Pachtabrechnung")

---

### Seite 1: Uebersicht (`/leases/settlement`)

Uebernommen vom Nutzungsentgelt, erweitert um Periodentyp.

```
+------------------------------------------------------------------+
| Pachtabrechnungen                          [Neue Abrechnung]     |
| Jahres- und Vorschussabrechnungen fuer Grundeigentuemer           |
+------------------------------------------------------------------+
|                                                                   |
| +-------------+ +-------------+ +-------------+ +-------------+  |
| | Jahres-     | | Nutzungs-   | | Offene      | | Abrechnungen|  |
| | erloese     | | entgelt     | | Abrechnungen| | gesamt      |  |
| | 1.234.567 € | | 123.456 €  | | 3           | | 12          |  |
| +-------------+ +-------------+ +-------------+ +-------------+  |
|                                                                   |
| Park: [Alle v]  Jahr: [2025 v]  Typ: [Alle v]  Status: [Alle v] |
|                                                                   |
| +------+------+------+-----------+----------+----------+--------+|
| | Park | Jahr | Typ  | Status    | Erloese  | Betrag   | Aktion ||
| +------+------+------+-----------+----------+----------+--------+|
| | WP1  | 2025 | End  | Berechnet | 500.000€ | 50.000€  | Detail ||
| | WP1  | 2025 | Q1   | Abgeschl. | -        | 4.166€   | Detail ||
| | WP1  | 2025 | Q2   | Abgeschl. | -        | 4.166€   | Detail ||
| | WP1  | 2025 | Q3   | Offen     | -        | -        | Detail ||
| | WP2  | 2025 | End  | Offen     | -        | -        | Detail ||
| +------+------+------+-----------+----------+----------+--------+|
+------------------------------------------------------------------+
```

**Neuer Filter "Typ":**
- Alle
- Endabrechnung (FINAL)
- Vorschuss (ADVANCE)

**Spalte "Typ":**
- FINAL → "Endabr." (oder "Jahresabr.")
- ADVANCE/YEARLY → "Jahresvorschuss"
- ADVANCE/QUARTERLY → "Q1", "Q2", "Q3", "Q4"
- ADVANCE/MONTHLY → "Jan", "Feb", ... "Dez"

**Button "Neue Abrechnung"** → navigiert zu `/leases/settlement/new` (Wizard)

---

### Seite 2: Wizard (`/leases/settlement/new`)

Uebernommen von der bisherigen Pachtabrechnung mit Erweiterungen.

#### Schritt 1: Park & Zeitraum

```
+------------------------------------------------------------------+
|  (1)--------(2)--------(3)--------(4)                            |
|  Park &      Umsatz-    Berechnung  Abschluss                   |
|  Zeitraum    daten      & Vorschau  & Gutschriften               |
+------------------------------------------------------------------+
|                                                                   |
|  Windpark *                                                       |
|  [ WP Barenburg v ]                                              |
|                                                                   |
|  Jahr *                                                           |
|  [ 2024 ]  Hinweis: Pacht wird nachtraeglich abgerechnet         |
|                                                                   |
|  Abrechnungstyp *                                                 |
|  ( ) Jahresendabrechnung (FINAL)                                 |
|      Umsatzbasierte Abrechnung mit Vorschuss-Verrechnung         |
|  (o) Vorschuss (ADVANCE)                                        |
|      Regelmassige Abschlagszahlung auf Basis der Mindestpacht    |
|                                                                   |
|  [Wenn ADVANCE:]                                                  |
|  Intervall *                                                      |
|  (o) Monatlich  ( ) Quartal  ( ) Jaehrlich                      |
|                                                                   |
|  [Wenn Monatlich/Quartal:]                                       |
|  Monat/Quartal *                                                  |
|  [ Maerz v ]                                                     |
|                                                                   |
|  +-- Aktive Pachtvertraege ---------+                            |
|  | 8 Vertraege, 24 Flurstuecke      |                            |
|  | Gesamtflaeche: 125.400 m²        |                            |
|  +-----------------------------------+                            |
|                                                                   |
|  +-- Bereits erstellte Perioden ----+                            |
|  | Q1 2024: Abgeschlossen (4.166€)  |                            |
|  | Q2 2024: Abgeschlossen (4.166€)  |                            |
|  +-----------------------------------+                            |
|                                                                   |
|                                          [Zurueck] [Weiter]      |
+------------------------------------------------------------------+
```

#### Schritt 2: Umsatzdaten (nur bei FINAL)

```
+------------------------------------------------------------------+
|  Umsatzdaten                                                      |
|                                                                   |
|  Datenquelle *                                                    |
|  (o) Automatisch aus Energieabrechnung                           |
|  ( ) Manuell eingeben                                            |
|                                                                   |
|  [Wenn automatisch:]                                              |
|  Energieabrechnung *                                              |
|  [ EAR-2024-001: 523.456,78 € v ]                               |
|                                                                   |
|  +-- Umsatz-Zusammenfassung --------+                            |
|  | Gesamtumsatz:     523.456,78 €   |                            |
|  | Umsatzanteil:     10,00 %        |                            |
|  | = Umsatzbeteiligung: 52.345,68 € |                            |
|  |                                   |                            |
|  | Mindestpacht:     48.000,00 €    |                            |
|  | (6.000€ x 8 WEA)                 |                            |
|  |                                   |                            |
|  | → Hoeherer Wert gilt (MAX-Regel) |                            |
|  +-----------------------------------+                            |
|                                                                   |
|  [Wenn ADVANCE: Schritt wird uebersprungen]                      |
|  Info: "Vorschuesse basieren auf der Mindestpacht.               |
|         Kein Umsatz erforderlich."                                |
|                                                                   |
|                                          [Zurueck] [Weiter]      |
+------------------------------------------------------------------+
```

#### Schritt 3: Berechnung & Vorschau

```
+------------------------------------------------------------------+
|  Berechnung & Vorschau                                            |
|                                                                   |
|  [Berechnung starten]                                            |
|                                                                   |
|  [Nach Berechnung:]                                               |
|                                                                   |
|  +-- Ergebnis-KPIs -----------------+                            |
|  | Gesamtpacht:  52.345,68 €        | (oder Mindestpacht)       |
|  | Modell:       Umsatzbeteiligung   | (oder Mindestpacht)       |
|  | Steuerpfl.:   47.111,11 €  (19%)  |                           |
|  | Steuerfrei:    5.234,57 €  (§4)   |                           |
|  +-----------------------------------+                            |
|                                                                   |
|  +-- Aufstellung nach Eigentuemer ---+                            |
|  | Name      | Pool% | Standort | Vers. | Wege | Kabel | Ges.  ||
|  |-----------|-------|----------|-------|------|-------|-------||
|  | Mueller   | 32,4% | 6.535€   | 450€  | 120€ | 80€   | 7.185||
|  | Schmidt   | 28,1% | 6.535€   | 0€    | 0€   | 0€    | 6.535||
|  | ...       |       |          |       |      |       |       ||
|  | SUMME     |       |          |       |      |       |52.345 ||
|  +-----------------------------------+                            |
|                                                                   |
|  [FINAL: Vorschuss-Verrechnung]                                  |
|  | Name      | Gesamt  | Vorschuesse | Restbetrag               ||
|  |-----------|---------|-------------|----------                 ||
|  | Mueller   | 7.185€  | -4.800€     | 2.385€                   ||
|  | Schmidt   | 6.535€  | -4.200€     | 2.335€                   ||
|                                                                   |
|  [Neu berechnen]                     [Zurueck] [Weiter]          |
+------------------------------------------------------------------+
```

#### Schritt 4: Abschluss & Gutschriften

```
+------------------------------------------------------------------+
|  Zusammenfassung                                                  |
|                                                                   |
|  +-- Abrechnungsdaten ---------------+                           |
|  | Windpark:     WP Barenburg        |                           |
|  | Zeitraum:     Endabrechnung 2024  |                           |
|  | Gesamtumsatz: 523.456,78 €        |                           |
|  | Pacht total:  52.345,68 €         |                           |
|  | Modell:       Umsatzbeteiligung   |                           |
|  | Vertraege:    8                    |                           |
|  +------------------------------------+                           |
|                                                                   |
|  Gutschriften erstellen                                           |
|  Info: Gutschriften werden als ENTWURF erstellt und koennen      |
|        vor dem Versand bearbeitet werden.                         |
|                                                                   |
|  [Gutschriften erzeugen]                                         |
|                                                                   |
|  [Nach Erstellung:]                                               |
|  Erfolg: 8 Gutschrift(en) erstellt                               |
|                                                                   |
|  | Gutschrift-Nr | Empfaenger | Bruttobetrag                     |
|  |---------------|------------|------------                       |
|  | GS-2025-0042  | Mueller    | 2.838,15€                        |
|  | GS-2025-0043  | Schmidt    | 2.778,65€                        |
|                                                                   |
|  [Zur Uebersicht]  [Neue Abrechnung]  [Detail ansehen]          |
+------------------------------------------------------------------+
```

---

### Seite 3: Detail-Ansicht (`/leases/settlement/[id]`)

Uebernommen vom Nutzungsentgelt mit Erweiterungen.

```
+------------------------------------------------------------------+
| <- Zurueck                                                        |
| Pachtabrechnung WP Barenburg 2024               [Status: Berechnet]|
| Endabrechnung — Abrechnungsjahr 2024                              |
|                                                        [Aktionen] |
+------------------------------------------------------------------+
|                                                                   |
| +----------+ +----------+ +----------+ +----------+ +----------+ |
| |Jahres-   | |Berechnet | |Minimum   | |Tatsaechl.| |Modell    | |
| |erloese   | |10,00%    | |          | |          | |          | |
| |523.456€  | |52.345€   | |48.000€   | |52.345€   | |Umsatz    | |
| +----------+ +----------+ +----------+ +----------+ +----------+ |
|                                                                   |
| [Eigentuemer-Positionen] [Kostenumlage] [Vorschuesse] [Historie] |
|                                                                   |
| Tab: Eigentuemer-Positionen                                       |
| (Tabelle wie bisher aus Nutzungsentgelt)                         |
|                                                                   |
| Tab: Kostenumlage                                                 |
| (ParkCostAllocation-Tabelle wie bisher)                          |
|                                                                   |
| Tab: Vorschuesse (NEU)                                           |
| Zeigt alle ADVANCE-Perioden fuer diesen Park+Jahr               |
| | Periode | Intervall | Status      | Betrag    |               |
| |---------|-----------|-------------|-----------|               |
| | Q1 2024 | Quartal   | Abgeschl.   | 12.000€   |               |
| | Q2 2024 | Quartal   | Abgeschl.   | 12.000€   |               |
| | Q3 2024 | Quartal   | Freigegeben | 12.000€   |               |
| | Q4 2024 | Quartal   | Offen       | -         |               |
| | SUMME   |           |             | 36.000€   |               |
|                                                                   |
| Tab: Historie (NEU)                                               |
| Aenderungsprotokoll der Abrechnung                               |
+------------------------------------------------------------------+
```

**Kontext-Aktionen je Status:**

| Status | Aktionen |
|--------|----------|
| OPEN | "Berechnung starten", "Loeschen" |
| CALCULATED | "Neu berechnen", "Gutschriften erzeugen" |
| SETTLED | "Kostenumlage erstellen", "Zur Pruefung vorlegen" |
| PENDING_REVIEW | "Freigeben", "Zurueckweisen" |
| APPROVED | "Abschliessen" |
| CLOSED | (nur Ansicht) |
| CANCELLED | (Badge "Storniert") |

---

## Berechnungslogik

### Konsolidierter Calculator

Ein einziger Calculator in `src/lib/lease-revenue/calculator.ts` (erweitert):

```
calculateSettlement(params):
  IF periodType === "ADVANCE":
    1. Mindestpacht berechnen: minimumRentPerTurbine × turbineCount
    2. WEA/Pool aufteilen (10%/90%)
    3. Auf Verpachter verteilen (nach Flaeche/Turbinen)
    4. Durch Intervall-Divisor teilen (12/4/1)
    5. Zusatzentschaedigungen (Versiegelung, Wege, Kabel) anteilig
    → Ergebnis: Vorschuss-Items pro Verpachter

  IF periodType === "FINAL":
    1. Umsatz laden (EnergySettlement oder manuell)
    2. Revenue-Phase ermitteln (ParkRevenuePhase)
    3. Umsatzanteil berechnen: totalRevenue × revenueSharePercent
    4. Mindestpacht berechnen: minimumRentPerTurbine × turbineCount
    5. MAX-Regel: actualFee = MAX(calculatedFee, minimumGuarantee)
    6. WEA/Pool aufteilen
    7. Auf Verpachter verteilen
    8. Zusatzentschaedigungen berechnen
    9. Steuersplit: Pool=19% MwSt, Rest=§4 Nr.12 steuerfrei
    10. ADVANCE-Perioden laden (gleicher Park+Jahr, Status CLOSED/APPROVED)
    11. Vorschuesse pro Verpachter aufsummieren
    12. Restbetrag = Gesamt - Vorschuesse
    → Ergebnis: Endabrechnungs-Items pro Verpachter
```

### Aenderungen an bisheriger Logik

| Bisheriger Calculator | Aenderung |
|---|---|
| `src/lib/lease-revenue/calculator.ts` | Neuer Parameter `periodType`, `advanceInterval`, `month` |
| `src/lib/lease-revenue/allocator.ts` | Unveraendert (Kostenumlage nur bei FINAL) |
| `src/lib/lease-revenue/invoice-generator.ts` | Erweitert: auch ADVANCE-Gutschriften |
| `src/lib/settlement/calculator.ts` | **ENTFAELLT** (wird nicht mehr benutzt) |
| `src/lib/settlement/energy-calculator.ts` | **ENTFAELLT** |

---

## API-Konsolidierung

### Neue API-Struktur

```
/api/leases/settlement                        GET  — Liste (paginiert + Filter)
/api/leases/settlement                        POST — Erstellen (aus Wizard)
/api/leases/settlement/[id]                   GET  — Detail mit Items
/api/leases/settlement/[id]                   DELETE — Loeschen (nur OPEN)
/api/leases/settlement/[id]/calculate         POST — Berechnung ausfuehren
/api/leases/settlement/[id]/invoices          POST — Gutschriften erzeugen
/api/leases/settlement/[id]/review            POST — Zur Pruefung / Freigeben
/api/leases/settlement/[id]/close             POST — Abschliessen
/api/leases/settlement/[id]/cancel            POST — Stornieren
/api/leases/settlement/[id]/allocations       GET/POST — Kostenumlage
/api/leases/settlement/import                 POST — Historischer Import
/api/leases/settlement/setup/[parkId]         GET/POST — Park-Konfiguration
```

### Entfallende APIs

```
/api/leases/usage-fees/*                      → ENTFAELLT (redirect/alias moeglich)
/api/admin/settlement-periods/*               → ENTFAELLT
```

---

## Migrations-Strategie

### Phase 1: Schema-Migration

```sql
-- LeaseRevenueSettlement erweitern
ALTER TABLE "LeaseRevenueSettlement" ADD COLUMN "periodType" TEXT DEFAULT 'FINAL';
ALTER TABLE "LeaseRevenueSettlement" ADD COLUMN "advanceInterval" TEXT;
ALTER TABLE "LeaseRevenueSettlement" ADD COLUMN "month" INTEGER;
ALTER TABLE "LeaseRevenueSettlement" ADD COLUMN "linkedEnergySettlementId" TEXT;
ALTER TABLE "LeaseRevenueSettlement" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "LeaseRevenueSettlement" ADD COLUMN "reviewedAt" TIMESTAMP;
ALTER TABLE "LeaseRevenueSettlement" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "LeaseRevenueSettlement" ADD COLUMN "notes" TEXT;

-- Neuen Status-Wert hinzufuegen
-- PENDING_REVIEW, APPROVED zum Enum

-- Unique Constraint anpassen
ALTER TABLE "LeaseRevenueSettlement"
  DROP CONSTRAINT "LeaseRevenueSettlement_tenantId_parkId_year_key";
ALTER TABLE "LeaseRevenueSettlement"
  ADD CONSTRAINT "LeaseRevenueSettlement_tenantId_parkId_year_periodType_month_key"
  UNIQUE ("tenantId", "parkId", "year", "periodType", "month");
```

### Phase 2: Daten-Migration

```sql
-- Bestehende LeaseSettlementPeriod-Daten in LeaseRevenueSettlement migrieren
INSERT INTO "LeaseRevenueSettlement" (
  id, tenantId, parkId, year, periodType, advanceInterval, month,
  status, totalParkRevenueEur, actualFeeEur, notes, ...
)
SELECT
  id, tenantId, parkId, year, periodType, advanceInterval, month,
  CASE status
    WHEN 'OPEN' THEN 'OPEN'
    WHEN 'IN_PROGRESS' THEN 'CALCULATED'
    WHEN 'PENDING_REVIEW' THEN 'PENDING_REVIEW'
    WHEN 'APPROVED' THEN 'APPROVED'
    WHEN 'CLOSED' THEN 'CLOSED'
  END,
  COALESCE(totalRevenue, 0),
  COALESCE(totalActualRent, 0),
  notes, ...
FROM "LeaseSettlementPeriod";

-- Invoice-Verknuepfungen migrieren
UPDATE "Invoice" SET ...
WHERE "settlementPeriodId" IS NOT NULL;
```

### Phase 3: Code-Umstellung

1. Neuen konsolidierten Calculator bauen
2. Neue API-Routes unter `/api/leases/settlement/`
3. Neue UI-Seiten unter `/leases/settlement/`
4. Alte Routes als Redirects beibehalten (6 Monate)

### Phase 4: Aufraeumen

1. `LeaseSettlementPeriod`-Modell als deprecated markieren
2. Alte API-Routes entfernen
3. Alte UI-Seiten entfernen
4. Alte Calculator-Dateien entfernen

---

## Sidebar-Aenderung

### Vorher (2 Eintraege)

```
Pachtvertraege
  ├── Uebersicht
  ├── Nutzungsentgelt        ← ENTFAELLT
  ├── Pachtabrechnung        ← wird zu...
  └── Zahlungskalender
```

### Nachher (1 Eintrag)

```
Pachtvertraege
  ├── Uebersicht
  ├── Pachtabrechnung        ← Konsolidiert (Liste + Wizard)
  └── Zahlungskalender
```

---

## i18n Keys

Neue/geaenderte Keys in `de.json` und `en.json`:

```json
{
  "nav.leaseSettlement": "Pachtabrechnung",
  "settlement.title": "Pachtabrechnungen",
  "settlement.subtitle": "Jahres- und Vorschussabrechnungen fuer Grundeigentuemer",
  "settlement.newSettlement": "Neue Abrechnung",
  "settlement.periodType.FINAL": "Endabrechnung",
  "settlement.periodType.ADVANCE": "Vorschuss",
  "settlement.interval.MONTHLY": "Monatlich",
  "settlement.interval.QUARTERLY": "Quartalsweise",
  "settlement.interval.YEARLY": "Jaehrlich",
  "settlement.wizard.step1": "Park & Zeitraum",
  "settlement.wizard.step2": "Umsatzdaten",
  "settlement.wizard.step3": "Berechnung & Vorschau",
  "settlement.wizard.step4": "Abschluss",
  "settlement.tabs.positions": "Eigentuemer-Positionen",
  "settlement.tabs.allocations": "Kostenumlage",
  "settlement.tabs.advances": "Vorschuesse",
  "settlement.tabs.history": "Historie"
}
```

---

## Zusammenfassung der Vorteile

| Aspekt | Vorher (2 Systeme) | Nachher (1 System) |
|--------|--------------------|--------------------|
| Uebersicht | Nur Nutzungsentgelt hat KPIs | Alles in einer Liste |
| Erstellung | Wizard nur bei Pachtabrechnung | Wizard fuer alles |
| Vorschuesse | Zwei verschiedene Logiken | Eine Logik |
| Steuersplit | Nur Nutzungsentgelt | Immer verfuegbar |
| Kostenumlage | Nur Nutzungsentgelt | Immer verfuegbar |
| Approval-Workflow | Nur Pachtabrechnung | Immer verfuegbar |
| Sidebar | 2 Eintraege | 1 Eintrag |
| Code-Wartung | 2 Calculator, 2 API-Sets | 1 Calculator, 1 API-Set |
| Verstaendlichkeit | "Was ist der Unterschied?" | Ein klares System |

---

## Risiken & Mitigierung

| Risiko | Mitigierung |
|--------|-------------|
| Datenverlust bei Migration | Phase 2: `LeaseSettlementPeriod` bleibt als Backup-Tabelle |
| Bestehende Gutschriften verlieren Verknuepfung | Invoice-Migration mit FK-Update |
| Grosser Umbau, viele Dateien | Schrittweise: erst Schema → dann API → dann UI |
| Unique-Constraint-Konflikte | Nullbare `month`-Spalte + `COALESCE` in Constraint |

---

## Implementierungsreihenfolge

1. **Prisma-Schema** erweitern + Migration
2. **Calculator** konsolidieren (ADVANCE + FINAL in einem)
3. **API-Routes** neu unter `/api/leases/settlement/`
4. **Uebersichtsseite** (Liste + KPIs + Filter)
5. **Wizard** (4 Schritte, wiederverwendet)
6. **Detail-Ansicht** (Tabs inkl. Vorschuesse + Kostenumlage)
7. **Sidebar + i18n** anpassen
8. **Alte Routes** als Redirects
9. **Tests** + Verifizierung
10. **Cleanup** alte Dateien

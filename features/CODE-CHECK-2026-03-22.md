# Umfassender Code-Check — WindparkManager

**Datum:** 2026-03-22
**Scope:** Analytics, PDF-Reports, API-Routen, TypeScript, React, DB-Abfragen, neue Config-Dateien

---

## Zusammenfassung

- KRITISCH: 1 Bug (falsch gedachter Kommentar in import-service, kein echter Laufzeitfehler)
- HOCH: 2 Bugs (fehlender Composite-Index, Typ-Duplikation mit Risiko von Drift)
- MITTEL: 3 Befunde (fehlende Indizes, redundante loadTurbines-Aufrufe)
- NIEDRIG: 2 Befunde (veralterter Kommentar, DEFAULTS-Konstante dupliziert)
- SAUBER: SQL-Injection-Schutz, Availability-Formel, neue Config-Dateien, kein leerer SelectItem-Wert, keine useEffect-Fehler, keine as-any-Probleme

---

## 1. KRITISCH

### Kein echter Bug gefunden — Disponibles Problem

Alle drei Hauptbereiche sind korrekt:

**fetchAvailabilityBreakdown (Zeile 339-348):**
`relevantTime = t1 + t5`, dann `t1 / relevantTime * 100` — IEC 61400-26-2 korrekt.

**fetchAvailabilityTrend (Zeile 376-400):**
Liest `AVG("availabilityPct")` direkt aus `scada_availability` — korrekt,
da die gespeicherten Werte bereits mit der richtigen Formel berechnet wurden.

**fetchAvailabilityHeatmap (Zeile 414-460):**
Liest ebenfalls gespeicherte `availabilityPct`-Werte aus der DB — korrekt.

**fetchDowntimePareto (Zeile 468-525):**
Berechnet Prozentanteile innerhalb der T2-T6-Kategorien (nicht T1/(T1+T5)) — das ist fachlich korrekt fuer ein Pareto-Diagramm der Ausfallursachen.

**import-service.ts:**
Der Code auf Zeile 547 verwendet korrekt `t1 / relevantTime` (IEC-Formel).

---

## 2. HOCH

### BUG-H1: Duplizierter Interface-Typ ThresholdSettings

**Datei:** `src/components/settings/BusinessThresholds.tsx` (Zeile 19-26)
**Problem:** `ThresholdSettings` ist lokal als privates Interface definiert.
Dieselbe Schnittstelle existiert bereits als `export interface ThresholdSettings`
in `src/app/api/admin/settings/thresholds/route.ts` (Zeile 14).

Das fuehrt zu zwei unabhaengigen Typen, die aktuell identisch sind —
aber bei zukuenftigen Erweiterungen der API ohne Aktualisierung der Komponente auseinanderlaufen werden (Silent Type Drift).

**Konsequenz:** Wenn die API ein neues Feld erhaelt (z.B. `downtimeThreshold`),
kompiliert der Code trotzdem, aber das neue Feld wird im Formular nie angezeigt.

**Loesung:**
```typescript
// BusinessThresholds.tsx — ersetze das lokale Interface durch:
import type { ThresholdSettings } from "@/app/api/admin/settings/thresholds/route";
```

Ausserdem: der lokale `DEFAULTS`-Konstant (Zeile 28-35) dupliziert `DEFAULT_THRESHOLDS` aus der API-Route. Auch dieser sollte nicht dupliziert werden — er sollte aus dem API-Response befuellt werden (was er bereits tut via useEffect), also kann der DEFAULTS-Fallback entfernt werden.

**Prioritaet:** HOCH (stiller Typ-Drift bei Erweiterungen)

---

### BUG-H2: Fehlender zusammengesetzter Index auf scada_availability

**Datei:** `prisma/schema.prisma` (Zeile 2136-2140)
**Problem:** Alle Analytics-Abfragen auf `scada_availability` filtern nach
`("tenantId", "periodType" = 'MONTHLY', turbineId, date)`.
Der vorhandene Index `@@index([turbineId, date])` deckt nicht `tenantId` + `periodType` zusammen ab.
PostgreSQL muss bei grossen Datenmengen einen Full-Table-Scan innerhalb der
turbineId-Partition machen, um auf `periodType = 'MONTHLY'` zu filtern.

**Vorhandene Indizes:**
```
@@index([tenantId])
@@index([turbineId, date])
```

**Fehlender Index:**
```prisma
@@index([tenantId, periodType, turbineId, date])
```

Dieser Composite-Index wuerde alle 6 Abfragen in `fetchAvailabilityBreakdown`,
`fetchAvailabilityTrend`, `fetchAvailabilityHeatmap`, `fetchDowntimePareto` und
`fetchLostRevenue` beschleunigen.

**Prioritaet:** HOCH (Performance-Problem bei wachsenden Datenmemgen)

---

## 3. MITTEL

### BUG-M1: Fehlender sourceFile-Index auf scada_measurements

**Datei:** `prisma/schema.prisma` (Zeile 2187-2194)
**Problem:** Fast alle Analytics-Queries auf `scada_measurements` filtern nach
`sourceFile = 'WSD'`. Es gibt keinen Index der `sourceFile` einschliesst.

Der vorhandene composite Index `@@index([tenantId, turbineId, timestamp(sort: Desc)])`
deckt den Filter `sourceFile = 'WSD'` nicht ab.

Bei einem Park mit mehreren Turbinen und Jahren an SCADA-Daten
(10-Minuten-Intervalle = 52.560 Messwerte/Turbine/Jahr) koennte dieser fehlende
Selektivitaets-Filter erhebliche Auswirkungen haben.

Zu ueberlegender Index:
```prisma
@@index([tenantId, sourceFile, turbineId, timestamp(sort: Desc)])
```

Hinweis: Da `sourceFile` nur 2-3 verschiedene Werte hat (WSD, WDD etc.),
ist die Selektivitaet gering. Ein partieller Index waere besser, aber
Prisma unterstuetzt keine partiellen Indizes. Der Benefit muss gegen
Schreib-Overhead abgewogen werden — erst bei Millionen von Zeilen relevant.

**Prioritaet:** MITTEL

---

### BUG-M2: N+1-aehnliches Muster — loadTurbines pro Fetcher-Funktion

**Datei:** `src/lib/analytics/module-fetchers.ts`
**Problem:** Jede der ~15 Export-Funktionen ruft `loadTurbines()` separat auf.
Wenn `generateCustomReportPdf` z.B. 8 Module aktiviert hat, werden 8 identische
`prisma.turbine.findMany()`-Abfragen ausgefuehrt (fuer denselben tenantId+parkId).

**Ausmass:** Bei 14 gleichzeitig angefragten Modulen (Promise.all in customReportPdf.tsx):
bis zu 14 identische `loadTurbines`-DB-Aufrufe.

**Keine immediate Gefahr** da:
1. `prisma.turbine.findMany` ist schnell (kleine Tabelle)
2. Promise.all parallelisiert die Anfragen
3. Prisma-Connection-Pool handelt das intern

**Loesung (optional, mittelfristig):**
`loadTurbines`-Ergebnis als Parameter an alle Fetcher-Funktionen uebergeben
statt es intern zu laden, wenn mehrere Module kombiniert abgerufen werden.

**Prioritaet:** MITTEL (Performance-Optimierung, kein kritischer Bug)

---

### BUG-M3: Fehlender periodType-Index auf ScadaStateSummary

**Datei:** `prisma/schema.prisma` (Zeile 2219-2238)
**Problem:** `fetchFaultPareto` und `fetchWarningTrend` filtern `scada_state_summaries`
nach `tenantId`, `turbineId` und `date`. Das ist korrekt abgedeckt.

Aber `scada_availability` hat keinen Index fuer `periodType` separat —
nur ein implizites Unique-Constraint `[turbineId, date, periodType]`.
PostgreSQL kann dieses Unique-Constraint als Index nutzen, aber er beginnt
mit `turbineId`, nicht `tenantId`. Bei Cross-Park-Abfragen (parkId=null)
wird tenantId-Filter nicht ueber diesen Index gehen.

**Prioritaet:** MITTEL

---

## 4. NIEDRIG

### BUG-L1: Veralteter JSDoc-Kommentar in import-service.ts

**Datei:** `src/lib/scada/import-service.ts` (Zeile 482)
**Problem:** Der Funktions-Kommentar sagt:
```
* Calculates availabilityPct = (t1 / t2 * 100) before writing.
```
Das ist falsch (alte Formel). Der tatsaechliche Code auf Zeile 547 berechnet
korrekt `t1 / (t1 + t5) * 100` (IEC 61400-26-2).

**Kein Laufzeitfehler** — nur Dokumentation ist falsch.

**Loesung:** Zeile 482 korrigieren zu:
```
* Calculates availabilityPct = T1 / (T1 + T5) * 100 per IEC 61400-26-2.
```

**Prioritaet:** NIEDRIG

---

### BUG-L2: DEFAULTS-Konstante in BusinessThresholds.tsx dupliziert DEFAULT_THRESHOLDS

**Datei:** `src/components/settings/BusinessThresholds.tsx` (Zeile 28-35)
**Problem:**
```typescript
const DEFAULTS: ThresholdSettings = {
  availabilityWarning: 85,
  availabilityCritical: 70,
  // ...
};
```
Diese Zahlen sind hardcodiert und koennen von den Werten in
`src/lib/config/business-thresholds.ts` abweichen, wenn dort jemand die
Konstanten aendert. Der `DEFAULTS`-Wert wird aber nur als Fallback fuer
`handleNumberInput` verwendet (wenn User "" eingibt) — er wird nie als
Initialwert des Formulars gezeigt. Daher ist das Risiko gering.

**Prioritaet:** NIEDRIG

---

## 5. SAUBER (keine Bugs gefunden)

### SQL-Injection-Schutz
Alle `$queryRaw`-Aufrufe nutzen Prisma's Tagged Template Literals.
User-Input (tenantId, turbineId) wird ausschliesslich ueber `${param}` (parametrisiert)
oder `Prisma.join()` + `Prisma.sql` eingefuegt.
`$queryRawUnsafe` wird nirgendwo verwendet.
**Kein SQL-Injection-Risiko.**

### Availability-Formel-Konsistenz
- import-service.ts: `T1 / (T1 + T5)` (korrekt)
- fetchAvailabilityBreakdown: `T1 / (T1 + T5)` (korrekt)
- API availability route (fleet summary): `totalT1 / (totalT1 + totalT5)` (korrekt)
- fetchAvailabilityTrend: liest gespeicherte Werte (konsistent)
- fetchAvailabilityHeatmap: liest gespeicherte Werte (konsistent)

Keine alte `T1/total`-Formel mehr im Code.

### TypeScript / as any
Nur 3 Stellen mit `as any` gefunden:
1. `DrawControl.tsx:13`: `(window as any).L = L` — noetig fuer Leaflet-Globals, gerechtfertigt
2. `shp-parser.ts:398`: `const raw = geojson as any` — GeoJSON hat untypisierte Felder, gerechtfertigt
Keine `@ts-ignore` oder `@ts-expect-error`.

### SelectItem leerer String
Keine `SelectItem value=""` gefunden. Alle "alle Auswaehlen" Items verwenden `value="all"`.

### useEffect Dependency Arrays
Geprueft: analytics-filter-bar.tsx `[]` (korrekt — einmaliger Fetch beim Mount),
create-report-dialog.tsx `[open]` und `[open, defaultParkId]` (korrekt — bei Dialog-Oeffnung).

### PDF-Generator (customReportPdf.tsx / CustomReportTemplate.tsx)
- Alle Daten sind optional (`performanceKpis?`, `productionHeatmap?` etc.)
- Template prueft jeweils `if (!kpis) return null` vor jedem Datenzugriff
- Kein undefined-Zugriff auf optionale Felder gefunden
- `financialOverview` ohne EnergySettlement-Daten: `fetchFinancialSummary` gibt `{totalRevenueEur: 0, totalProductionKwh: 0, avgRevenuePerKwh: null}` zurueck — kein Crash

### API-Route /api/reports/custom
- Zod-Validierung mit Whitelist fuer Module-Keys
- Park-Berechtigungspruefung (findFirst mit tenantId)
- Tenant-Isolierung korrekt implementiert

### Neue Config-Dateien
- `src/lib/validation/patterns.ts` — korrekt importiert in settings/route.ts und admin/email
- `src/lib/config/business-thresholds.ts` — korrekt importiert in contracts, backup, settings
- `src/lib/config/pagination.ts` — korrekt importiert in 15+ API-Routen
- `src/app/api/admin/settings/thresholds/route.ts` — korrekt importiert in admin/settings/page.tsx
- `src/components/settings/BusinessThresholds.tsx` — korrekt importiert in admin/settings/page.tsx
- Keine zirkulaeren Abhaengigkeiten erkannt

---

## Priorisierte Massnahmen

| Prio | Bug | Aufwand | Risiko |
|------|-----|---------|--------|
| HOCH | BUG-H1: ThresholdSettings Typ-Import statt Duplikat | 5 min | Typ-Drift |
| HOCH | BUG-H2: Composite-Index auf scada_availability hinzufuegen | 15 min | Performance |
| MITTEL | BUG-M1: sourceFile in scada_measurements Index erwaegen | 30 min | Performance |
| MITTEL | BUG-M2: loadTurbines Caching bei Multi-Modul-Reports | 2h | Performance |
| MITTEL | BUG-M3: periodType-Index auf scada_availability | 15 min | Performance |
| NIEDRIG | BUG-L1: JSDoc-Kommentar korrigieren | 2 min | Dokumentation |
| NIEDRIG | BUG-L2: DEFAULTS-Konstante bereinigen | 5 min | Wartbarkeit |

---

## Production-Ready Entscheidung

**Status: PRODUCTION-READY** mit einem Vorbehalt.

Kein einziger Bug fuehrt zu falschem Verhalten, Datenverlust oder Sicherheitsproblemen.
Die gefundenen Probleme sind:
- 1x Typ-Drift-Risiko (BUG-H1) — betrifft nur kueniftige Erweiterungen
- N x Performance-Optimierungspotenzial fuer grosse Datenmemgen

Die Analytics-Berechnungen sind korrekt, die SQL-Injection-Schutzmassnahmen greifen,
und die neuen Config-Dateien sind sauber integriert.

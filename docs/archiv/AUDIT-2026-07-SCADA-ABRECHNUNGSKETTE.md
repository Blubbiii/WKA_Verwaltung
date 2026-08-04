# Audit: Kette SCADA-Import → Produktion → Abrechnung → Rechnung

> Stand 2026-07-29 · **Nur Befund, nichts gefixt** · Verifiziert gegen Code, nicht vermutet

Teilergebnis eines größer angelegten Audits, das wegen Session-Limit abgebrochen wurde.
Diese eine Kette wurde vollständig durchgelesen: Schema, Import, Aggregation, Batch-Routen,
Storno-Pfad, Auto-Import-Worker.

---

## Das Kernproblem: eine Falle mit zwei Ausgängen, beide kaputt

P0-1 und P0-3 hängen zusammen und bilden eine Sackgasse:

```
Gutschrift fehlerhaft
   │
   ├─→ Storno (das was die Fehlermeldung empfiehlt)
   │      └─→ gibt die Kette NICHT frei → alles bleibt gesperrt (P0-3)
   │
   └─→ Batch-Reject (der einzige verbleibende Weg)
          └─→ erzeugt beim Neuberechnen doppelte Gutschriften (P0-1)
```

Es gibt aktuell **keinen korrekten Weg**, eine fehlerhafte Energieabrechnung zu korrigieren.

---

## P0-1 — Batch-Reject öffnet den Weg zu doppelten Gutschriften

**Dateien**
- `src/app/api/batch/settlements/route.ts:57-74` — setzt Settlement von **INVOICED** zurück
  auf `DRAFT`. Permission nur `energy:update`, nicht `energy:settlements:finalize`.
  Rührt weder `EnergySettlementItem.invoiceId` noch die Invoices noch
  `TurbineProduction.status` an.
- `src/app/api/energy/settlements/[id]/calculate/route.ts:365-367` —
  `deleteMany({ where: { energySettlementId: id } })` löscht **alle** Items hart,
  auch die mit `invoiceId`.
- `src/app/api/energy/settlements/[id]/create-invoices/route.ts:106-110` —
  Doppel-Schutz prüft nur `item.invoice !== null`.

**Szenario** Gutschriften 12/2025 erstellt (5 Credit-Notes gebucht) → Batch-„Ablehnen" →
DRAFT → `calculate` → alte Items gelöscht, neue mit `invoiceId = null` → `create-invoices`
→ **zweiter Satz Gutschriften mit neuen Rechnungsnummern für denselben Zeitraum**. Die
ersten 5 existieren weiter, jetzt referenzlos.

**Auswirkung** Doppelte Auszahlung + zerrissener GoBD-Beleglink.

**Nebenbefund gleiche Datei, `:44-55`** — „approve" setzt `status = "INVOICED"` **ohne**
eine einzige Invoice zu erzeugen und ohne `TurbineProduction` zu markieren. Danach lehnt
`create-invoices` (`:102-104`) wegen `status !== "CALCULATED"` ab. Settlement gilt als
abgerechnet, es floss nie Geld. **Ebenfalls P0.**

**Warum es keinen sauberen Weg gibt** `PATCH /settlements/[id]` (`[id]/route.ts:141-143`)
verlangt DRAFT und sagt in der Fehlermeldung *„Setze Status zurück auf DRAFT um zu
bearbeiten"* — das `settlementUpdateSchema` (`:21-33`) enthält aber gar kein `status`-Feld.

---

## P0-2 — SCADA-Reimport überschreibt abgerechnete Produktionsdaten

**Dateien**
- `src/lib/scada/aggregation.ts:282-312` — `turbineProduction.upsert`, im `update`-Zweig
  `productionKwh` (**:304**) und `status: 'DRAFT'` (**:308**) **bedingungslos**.
  Kein Statuscheck.
- Aufruf: `src/lib/scada/import-service.ts:2061-2067`

**Gegenbeispiel — so machen es die anderen Pfade richtig**
- `src/app/api/energy/productions/import/route.ts:336-342` (CSV-Import blockt `INVOICED`)
- `src/app/api/energy/productions/[id]/route.ts:113-115` (PATCH blockt `INVOICED`)

**Szenario** 12/2025 abgerechnet, `TurbineProduction.status = INVOICED`. Enercon liefert
korrigierte `.wsd`-Dateien nach → Upsert schreibt neue kWh **und setzt Status auf DRAFT**.
Verschickte Gutschrift nennt 551.286 kWh, DB sagt jetzt 548.900 kWh.

**Auswirkung** Stille Divergenz zwischen ausgestellter Gutschrift und Datenbasis. Zwei von
drei Schreibpfaden schützen `INVOICED` — ausgerechnet der automatisierte nicht.

---

## P0-3 — Invoice-Storno gibt die Kette nicht frei

**Dateien**
- `src/app/api/invoices/[id]/cancel/route.ts:75-152` — die Storno-Transaktion fasst
  `EnergySettlement`, `EnergySettlementItem.invoiceId` und `TurbineProduction.status`
  **nicht** an. (Grep über `src/app/api/invoices/**` nach `EnergySettlement`: 0 Treffer.)
- `src/app/api/energy/productions/[id]/route.ts:113-115` — Fehlertext lautet
  *„Status ist INVOICED — bitte zuerst die zugehoerige Rechnung stornieren"*
- `src/app/api/energy/settlements/[id]/route.ts:290-294` — DELETE blockt, solange ein Item
  `invoiceId !== null` hat

**Szenario** User folgt der Fehlermeldung und storniert → danach: `TurbineProduction`
weiterhin `INVOICED` (PATCH/DELETE verboten), `EnergySettlement` weiterhin `INVOICED`
(`calculate` und `PATCH` verboten), `invoiceId` zeigt weiter auf die stornierte Rechnung
(`create-invoices` verboten, Settlement-DELETE verboten).

**Auswirkung** Hängender Prozess. Die Anleitung in der Fehlermeldung führt garantiert ins
Nichts. Einziger Ausweg ist P0-1.

**Korrekt wäre** Storno setzt `invoiceId = null`, Settlement → `CALCULATED`,
Produktionen → `CONFIRMED`.

---

## P1-4 — Turbinen-Hard-Delete löscht die Grundlage ausgestellter Gutschriften

**Dateien**
- `src/app/api/turbines/[id]/route.ts:284-299` — prüft ausschließlich `_count.contracts > 0`.
  Kein Check auf `turbineProductions`, `energySettlementItems`, Invoices.
- `prisma/schema.prisma:2923` — `TurbineProduction.turbine … onDelete: Cascade`
- `prisma/schema.prisma:1614` — `EnergySettlementItem.turbine … onDelete: SetNull`
- `prisma/schema.prisma:2482` — `ScadaMeasurement.turbine … onDelete: Cascade`

**Szenario** WKA wird verkauft und gelöscht → alle Produktionszeilen 2019–2026 und alle
10-Min-Messwerte weg. Die `EnergySettlementItem`-Zeilen bereits abgerechneter Perioden
bleiben mit `turbineId = NULL` stehen. Die Gutschriften von 2025 existieren weiter, ihre
Datengrundlage ist unwiederbringlich fort.

**Auswirkung** Datenverlust mit GoBD-Relevanz. Die anderen Löschpfade der Kette haben
Guards — dieser nicht.

---

## P1-5 — Rückwirkende Abrechnung zahlt an den *heutigen* Betreiber

**Dateien**
- `src/app/api/energy/settlements/[id]/calculate/route.ts:73-77`, `:130-135` —
  `operatorHistory: { where: { status: "ACTIVE", validTo: null } }`, dann
  `prod.turbine.operatorHistory[0]` (`:164`). **Kein Bezug zu `settlement.year`/`month`.**

**Die korrekte Implementierung existiert — wird aber nie aufgerufen**
- `src/lib/settlement/energy-calculator.ts:541-544` (`referenceDate` = Monatsmitte)
- `:603-609` — `validFrom <= referenceDate AND (validTo IS NULL OR validTo > referenceDate)`
- Laut `knip-parsed.json` sind `calculateEnergySettlement`/`saveEnergySettlement`
  unreferenziert → tote Parallel-Implementierung.

**Szenario** WKA wechselt am 01.03.2026 von Fonds A zu Fonds B. Am 15.03. wird die offene
Abrechnung 01/2026 berechnet → `validTo: null` matcht nur Fonds B → **Fonds B bekommt die
Gutschrift für Januar**, obwohl Fonds A betrieben hat.

**Auswirkung** Falsche Zahlungsempfänger auf echten Gutschriften.

---

## P1-6 — `create-invoices` sperrt Produktionen, die nie abgerechnet wurden

**Dateien**
- `calculate/route.ts:111-121` — `productionWhere` **ohne `status`-Filter** → DRAFT-Zeilen
  fließen in die Verteilung ein
- `calculate/route.ts:164-168` — Turbine ohne aktiven Betreiber wird per `logger.warn` +
  `continue` **still übersprungen**, der API-Response meldet nichts
- `create-invoices/route.ts:466-487` — `turbineProduction.updateMany` setzt
  `status = "INVOICED"` für **alle** Produktionen des Parks im Zeitraum, unabhängig davon,
  ob es dafür ein `EnergySettlementItem` gibt
- Zum Vergleich: `energy-calculator.ts:572` filtert korrekt
  `status: { in: ["CONFIRMED","INVOICED"] }` — wieder der tote Pfad

**Szenario** Park mit 6 WKA, bei WKA 6 ist der `TurbineOperator`-Eintrag abgelaufen.
`calculate` verteilt auf 5 Anlagen (Verteilungsbasis dadurch verschoben), meldet aber
„Berechnung erfolgreich". `create-invoices` markiert danach **alle 6** als `INVOICED`.
WKA 6 ist gesperrt, hat aber nie eine Gutschrift bekommen.

**Auswirkung** Fehlende Auszahlung + falsche Verteilungsbasis für die übrigen + dauerhaft
gesperrter Datensatz. Zusätzlich: ungeprüfte DRAFT-Produktion landet in echten Gutschriften.

---

## P1-7 — Abgebrochener Import blockiert alle Folgeimporte dauerhaft

**Dateien**
- `src/app/api/energy/scada/import/route.ts:70-86` — `startImport(...)` läuft als
  **Fire-and-Forget-Promise im Route-Handler** (kein `after()`, keine Queue). Der `.catch()`
  greift nur bei Promise-Rejection, nicht bei Prozess-Kill oder Redeploy.
- `:186-195` — blockiert jeden neuen Import mit `CONFLICT`, solange ein Log auf `RUNNING` steht
- `src/lib/scada/auto-import-service.ts:317-332` — Auto-Import überspringt ebenfalls stumm
- `src/app/api/energy/scada/import/[id]/route.ts` — hat **nur GET**, kein Cancel, kein Reaper

**Szenario** Import über 3.000 Dateien läuft, Container wird neu deployed → Log bleibt für
immer `RUNNING`. Danach: manueller Import → 409, nächtlicher Auto-Import → stiller Skip.
Fällt erst bei der nächsten Abrechnung auf. Nur ein DB-Eingriff hilft.

**Zusatzrisiko** `import-service.ts:1838-1850` + `:2017-2032` — `lastProcessedDate` wird
pro Datei fortgeschrieben, der inkrementelle Filter zieht auch Logs mit Status `PARTIAL`
heran. Eine mittendrin gescheiterte Datei (Tag X) wird von einer erfolgreichen späteren
(Tag X+1) überholt → Tag X wird künftig immer übersprungen. Dauerhafte Lücke im Monatswert,
der still als Verteilschlüssel weiterläuft.

---

## P2-8 — UTC-Monatsgrenze vs. lokale Abrechnungsperiode

**Dateien**
- `src/lib/scada/dbf-reader.ts:629-661` — `buildTimestamp()` rechnet Enercon-Wanduhrzeit
  korrekt nach UTC (das ist der Fix aus dem Save-Audit)
- `src/lib/scada/aggregation.ts:192-208` — Bulk-Aggregation gruppiert per SQL
  `EXTRACT(YEAR/MONTH FROM "timestamp")`, also nach **UTC**-Monat
- `src/lib/scada/import-service.ts:1550-1556` — `extractAffectedMonths()` nutzt
  `getUTCFullYear()/getUTCMonth()`
- `create-invoices/route.ts:124-129` — Leistungszeitraum der Gutschrift dagegen
  **lokal**: `new Date(settlement.year, settlement.month - 1, 1)`

**Szenario** Produktion am 01.01. zwischen 00:00 und 01:00 Ortszeit → UTC 31.12. 23:00 →
landet in Dezember. In DST-Monaten sind es 2 Stunden.

**Auswirkung** Nur Zahlen-Ungenauigkeit, keine Prozessblockade — der Netzbetreiber-Erlös
ist die Wahrheitsquelle, die Produktion nur Verteilschlüssel. Relevant beim kWh-Ausweis
auf der Gutschrift und bei anlagenscharfer Glättung.

> Im Code steht bereits ein TODO dazu (`dbf-reader.ts:625-627`) für einen Backfill
> historisch falsch gelabelter Zeilen — **dieser Backfill ist nirgends implementiert**.

---

## Geprüft und *nicht* als Bruch bestätigt

- **Rohdaten-Idempotenz** — `ScadaMeasurement` hat `@@unique([turbineId, timestamp, sourceFile])`
  (`schema.prisma:2485`), `createMany({ skipDuplicates: true })` (`import-service.ts:400-410`).
  Doppelimport derselben Datei erzeugt keine Duplikate. ✅
- **NULL-Month-Duplikat** bei `EnergySettlement` — bewusst per `findFirst` mit explizitem
  `month: null` abgefangen (`settlements/route.ts:185-206`). Der Postgres-NULL-DISTINCT-
  Fallstrick ist behandelt. ✅
- **`create-invoices` Atomarität** — läuft komplett in `$transaction` mit 60s-Timeout
  (`:187-492`), Nummernvergabe GoBD-konform innerhalb der TX. Bei Abbruch kein
  Teilzustand. ✅

---

## Muster, das sich durchzieht

Bei **P1-5** und **P1-6** existiert in `src/lib/settlement/energy-calculator.ts` jeweils
die **fachlich korrekte** Implementierung — stichtagsbezogene Betreiberermittlung und
Status-Filterung. Sie ist laut knip unreferenziert. Der aktive Pfad in
`calculate/route.ts` macht beides falsch.

Das ist dieselbe Doppelimplementierung, die schon der Architektur-Audit als P0 gemeldet
hatte (zwei parallele Settlement-Calculator). Damals als Wartbarkeitsproblem eingestuft —
tatsächlich ist es die Ursache von zwei Rechenfehlern in echten Gutschriften.

**Konsequenz für die Priorisierung:** Die Konsolidierung der beiden Calculator ist kein
Aufräumen, sondern Fehlerbehebung.

---

## Noch nicht geprüft (Audit abgebrochen)

Rechenkorrektheit · übrige End-to-End-Ketten (Rechnung→Zahlung→Buchung, Pacht, Gesellschafter,
Angebot→Rechnung, Dokument→Portal, Mahnwesen) · Edge Cases · Worker/Queues · tote
Funktionalität · Regressionsprüfung der eigenen Fixes · Verbesserungsvorschläge.

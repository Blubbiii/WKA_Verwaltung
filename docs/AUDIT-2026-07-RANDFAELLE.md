# Audit: Randfälle und Grenzwerte

> Stand 2026-07-29 · **Nur Befund, nichts gefixt** · Jedes Finding mit auslösender Eingabe

---

## Muster: drei Ursachen erklären 13 der 19 Fälle

Vor den Einzelbefunden, weil es die Fix-Strategie ändert:

### Ursache A — `setMonth()` vor `setDate()`
Betrifft Findings **1, 2, 15** sowie `cpi-check.ts:61` und `auto-renewal.ts:94`, die
dieselbe Konstruktion tragen.

Ein `addMonthsSafe(date, n, day)`-Helper, der erst auf den 1. normalisiert und den Zieltag
gegen `daysInMonth` klemmt, räumt die ganze Klasse ab.
**`src/lib/accounting/reports/liquidity.ts:59-67` macht es bereits richtig** — dort steht
`cur` immer auf dem 1., deshalb kann `setMonth(+1)` nicht überlaufen.

### Ursache B — gemischte Bezugsbasis in Quotenrechnungen
Betrifft **3, 9** (und erklärt auch Finding 4). Zähler und Nenner stammen aus
unterschiedlich gefilterten Mengen.

Eine Assertion „Summe aller Quoten ∈ [99,99 %, 100,01 %]" **direkt vor dem Persistieren**
hätte alle drei gefangen. Das ist derselbe Invarianten-Test, den schon das
Rechenkorrektheits-Audit empfohlen hat.

### Ursache C — `preview()` validiert, `execute()` nicht
Betrifft **4**. Die Prüfung gehört in den gemeinsamen Pfad, nicht in den Vorschauzweig.

---

## P0 — Geld/Daten brechen still

### 1 · Monatliche Abrechnungsregel überspringt einen ganzen Monat
`src/lib/billing/scheduler.ts:140-143`

`next.setMonth(next.getMonth() + 1)` läuft auf einem Datum, das noch den Tag des
Ausgangsmonats trägt — *bevor* `setDate(validDay)` folgt.

**Eingabe** `calculateNextRun({frequency:"MONTHLY", dayOfMonth:null})` am **31.01.2026**
→ `validDay=1`, `31 >= 1` → `setMonth(1)` auf 31.01. → „31. Februar" → JS rollt auf
**03.03.** → `setDate(1)` → **01.03.2026**.

**Der 01.02. entfällt.** Trifft jeden 29./30./31. (Jan, Mär, Mai, Jul, Aug, Okt, Dez).
Eine Abrechnungsperiode wird nie ausgeführt, stillschweigend.

Gleicher Fehler in QUARTERLY (`:155`), SEMI_ANNUAL (`:173`) und default (`:192`).

### 2 · Identisches Muster in Dauerrechnungen
`src/lib/invoices/recurring-invoice-service.ts:69-70, 76-77, 83-84, 90-91`

**Eingabe** `calculateNextRunDate("MONTHLY", new Date("2026-01-31"), 15)` →
**15.03.2026 statt 15.02.2026**

ANNUAL (`:90`) zusätzlich schaltjahrsanfällig: `fromDate = 29.02.2024` →
`setFullYear(2025)` → 01.03.2025 → `setDate(28)` → **28.03.2025** statt 28.02.2025.

### 3 · Verteilungsquoten summieren sich auf über 100 %
`src/lib/settlement/calculator.ts:824-828` und `:1080-1084`

`totalStandortSqm` (`:413`, `:729`) summiert nur Flächen **mit** `areaSqm`;
`totalWeaAreaCount`/`totalWeaCount` (`:412`, `:728`) zählt **alle**. Der Ratio-Zweig mischt
beide Basen:

```ts
if (totalStandortSqm > 0 && areaSqm > 0) ratio = areaSqm / totalStandortSqm;
else if (totalWeaCount > 0)              ratio = 1 / totalWeaCount;
```

**Eingabe** Park mit 5 WEA_STANDORT-Flächen, davon 3 mit m²-Angabe, 2 mit
`areaSqm = null` (typische Datenlage nach Teilimport). Die 3 teilen sich 100 %, die 2
bekommen je 1/5 → **Gesamtquote 140 %**.

**Wirkung** 40 % Überzahlung an die Verpächter — sowohl im Vorschussplan (`:829`) als auch
in der Jahresabrechnung (`:1087`). Kein Fehler, keine Warnung.
Der Test `calculator.test.ts:104` deckt nur den Fall ab, dass *alle* ohne m² sind.

### 4 · `execute()` prüft die Anteilssumme nicht
`src/lib/billing/rules/distribution.ts:220-296`

`preview()` warnt bei `Math.abs(totalPercentage - 100) > 0.01` (`:155`).
**`execute()` enthält diese Prüfung nicht.**

**Eingabe** Fund mit Gesellschaftern, deren `distributionPercentage` in Summe 150 % ergibt
(z. B. nach einem Anteilsübertrag, bei dem der Altgesellschafter nicht auf 0 gesetzt
wurde), Regel mit `totalAmount = 100.000 €` ausführen.

**Ergebnis** **150.000 € an Gutschriften** werden erzeugt, `Distribution.totalAmount` steht
auf 100.000, Status `EXECUTED`, kein Fehler. Umgekehrt bei 50 %: die Hälfte verschwindet,
ebenfalls `EXECUTED`.

---

## P1 — falsche Werte / Crash im Normalbetrieb

### 5 · Buchung schlägt bei langer Positionsbeschreibung fehl
`src/lib/accounting/auto-posting.ts:153, 163, 189, 204, 212`

`InvoiceItem.description` ist unbegrenzt (TEXT), `JournalEntryLine.description` ist
`@db.VarChar(200)`. Diese fünf Stellen kopieren **ohne `.slice(0,200)`** — die
Nachbarzeilen `:174`, `:245`, `:350` slicen sehr wohl.

**Eingabe** Rechnungsposition mit 250-Zeichen-Leistungsbeschreibung → Prisma `P2000` →
die gesamte Auto-Buchungs-Transaktion bricht ab, **die Rechnung bleibt unbuchbar**.

### 6 · Storno an der Feldgrenze unmöglich
`src/lib/accounting/auto-posting.ts:323`, `:351`

`description: \`Storno: ${line.description || ""}\`` ohne Slice → bei ≥193 Zeichen > 200
→ `P2000`. Gleiche Klasse bei `reference: \`ST-${original.reference || ""}\`` gegen
`@db.VarChar(100)`.

**Eingabe** Rechnung stornieren, deren Buchungszeile 195 Zeichen hat → **Storno dauerhaft
blockiert**, Fehlermeldung nennt nur „UPDATE_FAILED".

### 7 · Buchungsdatum wird stillschweigend durch das Importdatum ersetzt
`src/lib/bank-import/camt054-parser.ts:87-88`

```ts
const dateStr = (bookgDt?.Dt as string) || (valDt?.Dt as string) || "";
const date = dateStr ? new Date(dateStr) : new Date();
```

CAMT.054 definiert `BookgDt` als `DateAndDateTime2Choice` — Banken dürfen **`<DtTm>`
statt `<Dt>`** liefern.

**Eingabe** CAMT-Datei mit `<BookgDt><DtTm>2026-01-15T10:22:00</DtTm></BookgDt>` →
`dateStr` leer → **alle Transaktionen bekommen das heutige Datum**. Der Datumsnähe-Check
im Matcher (`matcher.ts:186-189`, ±30 Tage) arbeitet dann auf erfundenen Daten, und die
Buchungen landen in der falschen Periode.

### 8 · Substring-Match ohne Mindestlänge und ohne Betragsprüfung → Falschzuordnung mit „high"
`src/lib/bank-import/matcher.ts:146-152`

```ts
if (normalised && ref.includes(normalised)) return inv;
```

`normaliseInvoiceNumber` (`:199-201`) entfernt nur Leerzeichen/Bindestriche, **keine
Mindestlänge**. `findByInvoiceNumber` prüft den **Betrag überhaupt nicht**.

**Eingabe** Offene Rechnung `invoiceNumber = "100"` (Nummernkreis ohne Präfix) +
eingehende Zahlung mit Verwendungszweck „Rechnung 1002 vom…" oder „Vertrag 4100".

**Ergebnis** `confidence: "high"` → in
`src/app/(dashboard)/invoices/bank-import/page.tsx:147` wird der Treffer **automatisch
vorausgewählt**, `matchedAmount` ist die Rechnungssumme, nicht der Zahlbetrag.
**Eine 50-€-Zahlung quittiert eine 10.000-€-Rechnung.**

### 9 · Nutzungsentgelt wird bei PROPORTIONAL nur teilweise zugeordnet
`src/lib/lease-revenue/allocator.ts:212-220`

`totalTurbines = park.turbines.length` (`:179`) zählt alle aktiven WEA; die Betreiber-Map
(`:181-183`) überspringt WEA ohne `operatorHistory`. `totalSharePercent` teilt aber durch
`totalTurbines`.

**Eingabe** Park mit 10 aktiven WEA, bei 1 fehlt die Betreiberhistorie,
`defaultDistributionMode = "PROPORTIONAL"` → Quoten summieren zu 90 %, **10 % des
Nutzungsentgelts werden niemandem zugeordnet**.

Im DULDUNG-Pfad (`:205-210`) tritt das nicht auf, weil dort über die Map summiert wird —
**der Bug ist modusabhängig und dadurch schwer zu bemerken.**

### 10 · Nichtdeterministische Betreiberwahl bei Betreiberwechsel
`src/lib/lease-revenue/allocator.ts:182`

`const activeOperator = turbine.operatorHistory[0];` — der `findMany`-Include (`:150-158`)
hat **kein `orderBy`**. Der Filter lässt bei einem Wechsel innerhalb des Jahres **beide**
Einträge durch.

**Eingabe** WEA wechselt am 30.06.2026 den Betreiber, Kostenverteilung für 2026 erzeugen →
**wer die WEA zugerechnet bekommt, hängt von der Zeilenreihenfolge in Postgres ab.**
Dieselbe Abrechnung zweimal ausgeführt kann unterschiedliche Empfänger haben.

### 11 · Jahrespacht im Startjahr fällt komplett aus
`src/app/api/leases/payments/route.ts:103-112`

```ts
currentDate = new Date(year, 0, 1);
if ((isAfter(currentDate, startDate) || currentDate.getTime() === startDate.getTime()) && …)
```

**Eingabe** `paymentSchedule = "ANNUAL"`, `startDate = 01.06.2026`, Kalender für 2026 →
`01.01.2026` liegt nicht nach `01.06.2026` → `dates` bleibt leer → **keine einzige Zahlung
im Startjahr**, obwohl der Vertrag läuft.

### 12 · Startmonat entfällt bei Vertragsbeginn nach dem 1.
`src/app/api/leases/payments/route.ts:61-70`

`startOfMonth(currentDate)` setzt auf den 1., die Innenbedingung verlangt aber
`isAfter(currentDate, effectiveStart)`.

**Eingabe** MONTHLY-Pacht ab **15.03.2026** → der 01.03. fällt durch die Prüfung →
**2026 hat 9 statt 10 Raten.**

### 13 · Kostenstellen: `parentId`/`parkId`/`fundId` ungeprüft durchgereicht
`src/app/api/cost-centers/[id]/route.ts:67-70`

```ts
await prisma.costCenter.updateMany({ where: { id, tenantId }, data });
```

Das `where` schützt nur die geänderte Zeile, nicht die referenzierte. Zod prüft lediglich
`z.string()` (`:18`).

- **a)** `PUT /cost-centers/X {"parentId":"X"}` → Kostenstelle wird ihr eigenes Parent
- **b)** `PUT /A {"parentId":"B"}` dann `PUT /B {"parentId":"A"}` → **Zyklus**
- **c)** `parentId` einer Kostenstelle eines **fremden Tenants** → FK global erfüllt,
  Prüfung fehlt → **mandantenübergreifende Verknüpfung**

Anders als bei `FundHierarchy` (`funds/hierarchy/route.ts:72, 91-116`) existiert hier
**kein** Zyklus- oder Selbstreferenz-Check.

### 14 · Zyklus-Check der Fund-Hierarchie ignoriert befristete Kanten
`src/app/api/funds/hierarchy/route.ts:100, 110`

Die rekursive CTE filtert in beiden Zweigen auf `h."validTo" IS NULL`. Eine Kante mit
**in der Zukunft** liegendem `validTo` ist damit unsichtbar, obwohl sie aktiv ist.

**Eingabe** Kante A→B mit `validTo = 2030-12-31`, danach Kante B→A → Check findet A nicht
als Vorfahre → **Zyklus wird committet.** Anschließend
`GET /funds/hierarchy/tree?rootFundId=A`: `buildTreeNode` (`tree/route.ts:82-108`) hat
**kein visited-Set** → unendliche Rekursion → `RangeError: Maximum call stack size
exceeded`, 500.

(`src/lib/accounting/consolidation.ts:46` hat das visited-Set und stürzt nicht ab.)

### 15 · Vorjahresvergleich verschiebt sich im Schaltjahr
`src/lib/accounting/reports/euer.ts:167-170`, `guv.ts:192-194`

`prevEnd.setFullYear(prevEnd.getFullYear() - 1)` auf dem 29.02. rollt auf den 01.03.

**Eingabe** EÜR für `01.01.2024 – 29.02.2024` → Vergleichszeitraum
**01.01.2023 – 01.03.2023**, einen Tag zu lang; Buchungen vom 01.03.2023 wandern in die
Vorjahresspalte.

---

## P2 — bestätigt, begrenzter Schaden

### 16 · Rundungsdifferenz bei Ausschüttungen wird nicht ausgeglichen
`src/lib/billing/rules/distribution.ts:164, 296`

Jeder bekommt `Math.round(total * pct / 100 * 100)/100`, **keine Restzuweisung** auf den
letzten Empfänger (anders als `energy-calculator.ts:404-419`).

**Eingabe** 1.000 €, 7 Gesellschafter à 14,2857 % (Summe 99,9999 %, passiert die
0,01-Toleranz) → jeder 142,86 € → **Summe 1.000,02 €**, `totalAmount` sagt 1.000,00.
Wächst linear mit der Empfängerzahl.

### 17 · Rundungskorrektur greift ab ~10 WEA nicht mehr
`src/lib/settlement/energy-calculator.ts:409-419`

Die Korrektur ist auf `Math.abs(roundingDifference) <= 0.05` gedeckelt — eine **feste Zahl
gegen einen mit n wachsenden Fehler** (max. `n × 0,005 €`).

**Eingabe** Park mit 30 WEA, Einzelbeträge runden in dieselbe Richtung → Differenz ~0,15 €
> 0,05 → **die Korrektur unterbleibt komplett**. Zwischen 11 und ~30 WEA ist das der
Regelfall, nicht der Ausreißer.

### 18 · Querbeteiligungen werden nicht addiert (Kommentar widerspricht dem Code)
`src/lib/accounting/consolidation.ts:58-63`

`if (visited.has(c.childFundId)) continue;` steht **vor**
`factors.set(child, (factors.get(child) ?? 0) + factor)`. Die Addition ist damit für jedes
Kind nur einmal erreichbar — der Kommentar in `:61-63` („Wenn ein Kind in mehreren Ketten
hängt, addieren sich die Anteile") beschreibt **totes Verhalten**.

**Eingabe** Fund A hält 50 % an C **und** 100 % an B, B hält 50 % an C.
Erwartet Faktor(C) = 1,0 · tatsächlich **0,5** — je nach Zweigreihenfolge.

### 19 · Ausschüttungsnummer kollidiert ab der 1000.
`src/lib/billing/rules/distribution.ts:31-52`

`orderBy: { distributionNumber: "desc" }` ist ein **String**-Sort, `padStart(3,"0")`
polstert nur auf 3 Stellen. Bei `AS-2026-999` und `AS-2026-1000` sortiert `"999"` vor
`"1000"` → `nextNumber` wird erneut 1000. Zusätzlich fehlt jede Transaktions-/Lock-
Absicherung.

---

## Als robust geprüft — kein Finding

- **Pagination** (`api-utils.ts:110-115`) — `Number.isFinite`-Guard plus Clamp auf
  `[1, maxLimit]`. `?limit=abc`, `?limit=-5`, `?page=0`, `?limit=1e999` liefern alle
  saubere Defaults ✅
- **`energy-calculator.ts:186`** — `totalProductionKwh / turbineCount` durch den
  `length === 0`-Throw garantiert ≠ 0. Bei n=1 ist `deviationFromAverage` korrekt 0 ✅
- **Alle drei Verteilungsmodi** (`energy-calculator.ts:307-315, 365-373, 457-465`) prüfen
  `totalProductionKwh > 0` vor jeder Division ✅
- **`liquidity.ts:59-67`** — `cur` steht immer auf dem 1., `setMonth(+1)` kann nicht
  überlaufen. **Vorbild für den Fix von Finding 1/2** ✅
- **`src/lib/iban.ts`** — Normalisierung (Uppercase + Whitespace-Strip), länderspezifische
  Längenprüfung, Mod-97 ✅
- **`camt054-parser.ts:77`** — `isNaN(rawAmount)`-Guard vorhanden, DBIT/CRDT-Vorzeichen
  korrekt ✅
- **`funds/hierarchy/route.ts:72`** — direkte Selbstreferenz explizit abgefangen,
  Zyklus-Check unter Serializable mit `depth < 100`-Bremse. Einzige Lücke ist Finding 14 ✅
- **Alle `reduce` ohne Initialwert** (`shadow/route.ts:53`, `module-fetchers.ts:1965`,
  `CustomReportTemplate.tsx:1301`) sind durch vorangestellte `length > 0`-Prüfungen
  geschützt ✅
- **Alle `Math.max`/`Math.min`-Spreads** haben Längenprüfung oder Fallback-Argument ✅
- **`journal-entries/route.ts:22, 41-42`** — Zod-`max()` deckt sich exakt mit
  `@db.VarChar(200)`/`(100)`. Manuell erfasste Buchungen sind sicher; **nur der
  programmatische Pfad (5/6) ist es nicht** ✅
- **Decimal-Präzision der Quotenfelder** — `productionSharePct @db.Decimal(8,5)` gegen
  `roundToFiveDecimals`, `allocationSharePercent @db.Decimal(8,4)` gegen `round4` ✅

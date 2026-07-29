# Audit: Rechenkorrektheit

> Stand 2026-07-29 · **Nur Befund, nichts gefixt** · Jedes Finding mit durchgerechnetem Zahlenbeispiel

Geprüft wurde nicht *ob* gespeichert wird, sondern **ob die Zahlen stimmen**.

---

## Kernbefund: die zwei Pacht-Calculator divergieren fundamental

Dieselbe Konstellation durch beide Implementierungen gerechnet.

**Setup:** Park mit 5 aktiven WEA · `minimumRentPerTurbine` 5.000 € · `weaShare` 10 % ·
`poolShare` 90 % · Erlösanteil 5 % · Parkerlös 2.000.000 € → `actualFee` =
MAX(100.000; 25.000) = **100.000 €**. Standort-Topf 10.000 €, Pool-Topf 90.000 €.
Flurstück P (10.000 m² POOL) an **zwei** Pachtgeber A+B, Flurstück Q (10.000 m² POOL) an C.

| | A | B | C |
|---|---|---|---|
| `lease-revenue/calculator.ts` | 30.000 € | 30.000 € | 30.000 € |
| `settlement/calculator.ts` | 45.000 € | **0 €** | 45.000 € |
| **korrekt** (P hälftig) | 22.500 € | 22.500 € | 45.000 € |

**Beide falsch, in entgegengesetzte Richtungen.**

---

## 1. Pachtabrechnung

### F1 — P0 · Doppelzählung bei mehreren Pächtern pro Flurstück
`src/lib/lease-revenue/calculator.ts:439-487`

Schleife `for (plot) → for (leasePlot) → for (plot.plotAreas)`. Die Flächen des Flurstücks
werden **pro Pachtvertrag komplett neu addiert** — auf `existing.poolAreaSqm` *und* auf
`totalPoolAreaSqm`. Kein Anteilsschlüssel.

**Wirkung:** C verliert 15.000 € (−33 %), A und B bekommen je 7.500 € zu viel. Bei
900.000 € Pool-Topf und 20 % Anteils-Flurstücken liegt die Fehlverteilung im
**fünfstelligen Bereich pro Jahr**.

### F2 — P0 · Nur der erste Pachtvertrag pro Flurstück wird bedient
`src/lib/settlement/calculator.ts:430-434` und `:776-780`

`plot.leasePlots.find(lp => lp.lease.status === "ACTIVE")` nimmt **den ersten** aktiven
Lease und ignoriert alle weiteren. Bei zwei Miteigentümern erhält B **0 €**. Kein Log,
keine Warnung. Betrifft auch `calculateMonthlyAdvance` → B bekommt weder Vorschuss noch
Endabrechnung.

### F3 — P0 · Standort-Topf wird überzahlt (Nenner ≠ Zähler-Basis)
`src/lib/lease-revenue/calculator.ts:433` vs. `:466` vs. `:116`

`totalWEACount = park.turbines.length` (Turbine-Records), aber `lease.turbineCount` zählt
**`WEA_STANDORT`-PlotAreas** — zwei verschiedene Datenquellen. Die Item-Anteile sind nicht
auf 100 % normiert.

**Zahlenbeispiel:** 5 Turbinen, Standort-Topf 50.000 €. Eine WEA auf einem Flurstück mit
2 Miteigentümern → Σ turbineCount = 6 → ausgezahlt 50.000 × 6/5 = **60.000 €**,
**10.000 € Überzahlung**. Gleiches Problem, wenn eine Turbine über zwei Flurstücke als
2 `WEA_STANDORT`-Flächen modelliert ist.

### F4 — P0 · Einmalentschädigungen werden jährlich abgerechnet
`src/lib/lease-revenue/calculator.ts:349-350`

```ts
plots: { ... include: { plotAreas: true, ... } }   // ← kein Filter
```

`settlement/calculator.ts:344` filtert korrekt auf `compensationType: "ANNUAL"`. Der
lease-revenue-Pfad lädt **alle** PlotAreas, auch `ONE_TIME`.

**Zahlenbeispiel:** Einmalentschädigung 25.000 m² Wegefläche × 0,50 €/m² = 12.500 € wird
**jedes Jahr erneut** ausgezahlt.

### F5 — P0 · Ausgleichsfläche: zwei völlig verschiedene Rechenmodelle
`lease-revenue/calculator.ts:473-477` vs. `settlement/calculator.ts:1118-1120`

- **settlement:** `AUSGLEICH = areaSqm × park.ausgleichCompensationPerSqm` (eigene Position)
- **lease-revenue:** AUSGLEICH wird in `poolAreaSqm` **eingemischt**;
  `ausgleichCompensationPerSqm` wird in der ganzen Datei **nie gelesen**

**Zahlenbeispiel:** Pool 100.000 m², Ausgleich 20.000 m² @ 0,15 €/m², Pool-Topf 90.000 €.
- settlement: Ausgleichs-Eigentümer 3.000 €; Pool-Eigentümer mit 20.000 m² → **18.000 €**
- lease-revenue: Ausgleich 0 € separat; Pool-Eigentümer → 20.000/120.000 × 90.000 =
  **15.000 €** (**−16,7 %**)

Umverteilung zulasten aller reinen Pool-Verpächter.

### F6 — P1 · Kabel: m² wird als Meter interpretiert
`src/lib/lease-revenue/calculator.ts:480`

```ts
existing.cableLengthM += Number(area.lengthM ?? areaSqm);
```

Ist `lengthM` nicht gepflegt, geht die **Fläche als Länge** in `× kabelCompensationPerM`.
`settlement/calculator.ts:1125` nutzt korrekt nur `lengthM`.

**Zahlenbeispiel:** Trasse 1.000 m × 2 m = 2.000 m², Satz 5 €/m → korrekt 5.000 €,
System **10.000 €** (**+100 %**).

### F7 — P1 · Versiegelte Fläche wird nie berechnet
`src/lib/lease-revenue/calculator.ts:450, 458-482, 120-122`

`sealedAreaSqm` wird mit 0 initialisiert und im `switch` über `area.areaType` **nie
befüllt** — es gibt keinen passenden Enum-Wert. Position erscheint auf jeder Rechnung mit
0,00 €. Zusätzlich wird `sealedAreaRate` fälschlich mit `wegCompensationPerSqm` vorbelegt.

### F8 — P0 · Vorschussverrechnung: Brutto gegen Netto
`src/lib/settlement/calculator.ts:967` + `:576`

```ts
sum + Number(inv.grossAmount)                                      // brutto
remainingAmount = Math.max(0, totals.totalPayment - paidAdvances)  // netto − brutto
```

**Zahlenbeispiel:** Jahresanspruch 25.000 € netto. 12 Vorschüsse à 1.375 € netto =
16.500 €; brutto (90 % Pool @ 19 %, 10 % §4 Nr. 12 steuerfrei) = 19.321,50 €.
- korrekt: 25.000 − 16.500 = **8.500 €**
- System: 25.000 − 19.321,50 = **5.678,50 €**
- **Verpächter wird um 2.821,50 € verkürzt (33 % der Nachzahlung).**

### F9 — P1 · Überzahlte Vorschüsse werden verschluckt
`settlement/calculator.ts:576`, `lease-revenue/calculator.ts:647`

Beide klemmen mit `Math.max(0, …)`. Bei schwachem Windjahr wird die Rückforderung auf 0
gesetzt statt als negative Position ausgewiesen.

**Zahlenbeispiel:** 4 Vorschüsse à 2.500 € = 10.000 €, Endabrechnung 8.000 € → Restbetrag
0 €, tatsächlich **2.000 € rückzufordern**. Taucht in keiner Auswertung auf.

### F10 — P1 · `weaShare + poolShare` wird nie auf 100 % geprüft
`lease-revenue/calculator.ts:95-100`, `settlement/calculator.ts:1087/1105`

Beide Töpfe werden unabhängig aus `actualFeeEur` gebildet.

**Zahlenbeispiel:** weaShare 10 %, poolShare 85 % (Tippfehler), actualFee 500.000 € →
ausgezahlt 475.000 €, **25.000 € verschwinden lautlos**. Bei 105 % würden 25.000 € zu viel
fließen.

Verschärfend: die **Mittelwertbildung** über Turbinen-Overrides (`:504-506` bzw.
`:374-376`) — hat nur eine von 5 Turbinen abweichende Anteile, ergibt das arithmetische
Mittel der Prozentsätze keinen konsistenten Verteilschlüssel mehr.

### F11 — P1 · Default 90/10 nur im ADVANCE-Pfad
`settlement/calculator.ts:670/675` vs. `:361-362`

`calculateMonthlyAdvance` fällt bei fehlender Konfiguration auf 10/90 zurück,
`calculateSettlement` auf `null` → 0/0.

**Zahlenbeispiel:** Park ohne konfigurierte Anteile, 3 WEA à 5.500 € Mindestpacht. ADVANCE
zahlt 12 × 1.375 € = **16.500 €** aus. FINAL ergibt `totalPayment` = **0 €** →
`remainingAmount = max(0, 0 − 16.500) = 0`. Die 16.500 € sind ausgezahlt und werden nie
zurückgefordert (F9).

### F12 — P0 · Erlösbasis kann doppelt zählen
`src/lib/lease-revenue/calculator.ts:400-411`

```ts
prisma.energySettlement.aggregate({ where: { parkId, tenantId, year, status: {...} } })
```

**Kein `month`-Filter.** Das Schema erlaubt via `@@unique([parkId, year, month, tenantId])`
mit nullable `month` sowohl 12 Monats- als auch eine Jahresabrechnung.

**Zahlenbeispiel:** 12 Monatsabrechnungen mit 2.400.000 € + eine Jahres-Rollup mit
2.400.000 € → `totalParkRevenueEur` = 4.800.000 €. Bei 5 % Erlösanteil:
**240.000 € statt 120.000 €** — Pächter erhalten das Doppelte.

Dasselbe Muster **ohne jeden Statusfilter** in
`src/app/api/buchhaltung/multi-park-soll-ist/route.ts:116-125` — der Filter ist
auskommentiert (`// status: {...} // optional`), also fließen auch DRAFT- und verworfene
Abrechnungen in die Ist-MWh ein.

---

## 2. Buchhaltung

### F13 — P1 · Degressive AfA: falscher Satz **und** falsche Methodik
`src/lib/accounting/afa.ts:230-240`

```ts
const linearRate = 12 / usefulLifeMonths;
const decliningRate = Math.min(linearRate * 2, 0.3);
const monthlyAmount = (bookValueBefore * decliningRate) / 12;
```

1. **Es gibt keine Rechtsfassung mit „2× / max. 30 %".** §7 Abs. 2 EStG für Anschaffungen
   2020–2022: 2,5× / max. 25 %. Fassung 2024: 2,0× / max. 20 %. Der Code mischt beide.
2. Degressive AfA ist eine **Jahres**-AfA auf den Buchwert zum 1.1. Der Code wendet 1/12
   des Satzes auf den *laufend sinkenden* Buchwert an → geometrische Degression im Jahr.

**Zahlenbeispiel:** AK 100.000 €, ND 10 J., Anschaffung 2022, volles Jahr.
- gesetzlich (2,5× / 25 %): **25.000 €**
- Code-Satz 20 %, korrekt jährlich: 20.000 €
- Code tatsächlich: 100.000 × (1 − (1 − 0,0166667)¹²) = **18.293 €** → **−27 %**

Zusätzlich fehlt der Pflichtübergang zur linearen AfA (§7 Abs. 3 EStG) — das Asset
erreicht rechnerisch nie 0.

### F14 — P1 · GWG-Sammelposten: Monats- statt Jahresauflösung
`src/lib/accounting/afa.ts:208-218`

§6 Abs. 2a EStG: jeweils **1/5 im Jahr der Bildung und den folgenden vier Jahren**, ohne
zeitanteilige Kürzung. Der Code rechnet `AK / (5 × 12)` pro Monat ab Anschaffungsmonat.

**Zahlenbeispiel:** Sammelposten 900 €, Anschaffung 20.11.2025.
- gesetzlich: 2025 = 180 €, 2026–2029 je 180 €
- Code: 2025 = **30 €** (−83 %), 2026–2029 je 180 €, **2030 = 150 €**

Der Sammelposten läuft in ein **sechstes Jahr** — Beanstandung bei der Betriebsprüfung.

### F15 — P2 · GWG-Schwellen werden nie geprüft
`src/lib/accounting/afa.ts:199-218`

`gwgSofortThresholdEur` (800 €), `gwgPoolLowerEur`, `gwgPoolUpperEur` werden geladen, aber
**nie gegen `acquisitionCost` verglichen**. Ein Asset mit 50.000 € AK und
`afaMethod = GWG_SOFORT` wird im Anschaffungsmonat zu 100 % abgeschrieben.

### F16 — P2 · Lineare AfA läuft einen Monat zu lang
`src/lib/accounting/afa.ts:220-227, 245`

Monatsbetrag auf 2 NK gerundet, Terminierung hängt am ungerundeten Restwert.
AK 100.000 €, ND 120 Monate → 833,33 €/Mon. Nach 120 Monaten sind 99.999,60 €
abgeschrieben → **Monat 121** erzeugt eine AfA-Buchung über 0,40 €. Anlagenspiegel weist
AfA nach Ablauf der ND aus, `fullyDepreciated` bleibt bis dahin `false`.

### F17 — P1 · Verzugszinsen: ein Basiszinssatz für den gesamten Zeitraum
`src/lib/accounting/dunning.ts:123` + `src/lib/accounting/interest.ts:130`

`getBaseRateAt(now)` liefert den **heute** gültigen Satz für alle Verzugstage. §247 BGB
ändert sich halbjährlich — die Zinsen sind je Halbjahr getrennt zu rechnen.

**Zahlenbeispiel:** 50.000 € offen, fällig 01.04.2025, Stichtag 01.04.2026, B2B.
- System (1,27 % + 9 = 10,27 %): **5.135 €**
- korrekt segmentiert (91 T @ 11,27 % + 274 T @ 10,27 %): **5.259,12 €**
- Δ **124 €** je Forderung; bei Forderungen aus der Hochzinsphase 2024 (3,62 %) mehrere
  hundert Euro.

### F18 — P1 · B2B-Erkennung greift nur bei Pachtrechnungen
`src/lib/accounting/dunning.ts:109-113, 136-138`

B2B-Flag wird ausschließlich über `invoice.lease.lessor` ermittelt. Jede Rechnung **ohne**
Lease-Bezug (Betriebsführung, Direktvermarktung, Weiterberechnungen) landet auf `false`
→ 5 statt 9 Prozentpunkte, **und die 40-€-Pauschale nach §288 Abs. 5 BGB entfällt**.

**Zahlenbeispiel:** 50.000 €, 365 Tage, Basis 1,27 %.
- System: 6,27 % → 3.135 €, keine Pauschale
- korrekt: 10,27 % → 5.135 € + 40 € = **5.175 €** → **2.040 € zu wenig gefordert**

### F19 — P1 · Mahnung nennt den Bruttobetrag, nicht den offenen Betrag
`src/lib/accounting/dunning.ts:141-144` vs. `:224`

Offener Betrag wird korrekt als `grossAmount − paidAmount` berechnet, aber **nur für die
Zinsen** verwendet. Auf dem `DunningItem` steht `amount: c.grossAmount`.

**Zahlenbeispiel:** Rechnung 10.000 €, Teilzahlung 8.000 € → Mahnung fordert **10.000 €**
statt 2.000 €. Rechtlich angreifbar.

*Nebenbefund (P2):* `computeOverdueDays` (`:71-75`) rechnet mit rohen Millisekunden,
`interest.ts:daysSince` normalisiert auf UTC-Mitternacht → gespeicherte
`interestDaysOverdue` kann um 1 Tag von der Zinsberechnung abweichen.

---

## 3. Analytics

### F20 — P1 · Kapazitätsfaktor: Zähler misst Ist-Daten, Nenner die Kalenderzeit
`src/lib/analytics/module-fetchers.ts:109-111`, `:610-613`, `query-helpers.ts:79-91`

```ts
const { from, to } = buildDateRange(year);   // IMMER 01.01.–01.01. Folgejahr
const hours = hoursInPeriod(from, to);        // IMMER 8.760
capacityFactor = productionKwh / (ratedPowerKw * hours) * 100
```

**(a) Laufendes Jahr** — 3.000-kW-Anlage, Jan–Jul 5.000.000 kWh (5.088 h):
korrekt **32,8 %**, System **19,0 %** → **−42 % relativ**

**(b) Datenlücken** — `productionKwh` summiert nur vorhandene Sätze. `dataCompleteness`
wird direkt daneben berechnet (`:127`) und **nicht verwendet**. Bei 92 % Vollständigkeit
und 8.000.000 kWh: System **28,0 %** statt 30,4 %.

Da die Vollständigkeit je Anlage schwankt, sind auch das Turbinen-**Ranking** (`:650`) und
`deviationFromFleetPct` systematisch verzerrt — genau die Kennzahl, die Minderleistung
aufdecken soll.

### F21 — P2 · Verfügbarkeit: T2/T3/T6 fallen aus Zähler *und* Nenner
`module-fetchers.ts:346-358`, `api/energy/analytics/availability/route.ts:43-48`

`availability = T1 / (T1 + T5)`. Nur Volllast gilt als verfügbar.

**Zahlenbeispiel** (8.760 h): T1 8.000 · T2 300 · T3 200 · T4 100 · T5 160
- System: **98,04 %**
- IEC 61400-26-2 ((T1+T2+T3)/(T1+T2+T3+T5)): **98,15 %**
- Zeitverfügbarkeit inkl. Wartung: **97,03 %**

Verteidigbar, *wenn* T2 hier tatsächlich „Windstille" bedeutet (so der Kommentar in `:348`)
— dann sind aber T3 und T6 falsch behandelt. **Wichtiger:** Das ist nicht die Kennzahl,
gegen die WEA-Verfügbarkeitsgarantien im Wartungsvertrag abgerechnet werden. Bei einer
97-%-Garantie mit Pönale entscheidet die Definition über fünfstellige Beträge.
Gehört dokumentiert und gegen den Vertragstext geprüft.

---

## 4. Wirtschaftsplan

### F22 — P1 · Dezember-Buchungen fehlen im Soll/Ist
`src/lib/accounting/reports/budget-comparison.ts:80-81`

```ts
const periodStart = new Date(budget.year, fm, 1);              // LOKAL
const periodEnd = new Date(budget.year, tm + 1, 0, 23,59,59);  // LOKAL
```
gefiltert gegen `entryDate` (UTC). In Europe/Berlin ist
`new Date(2026, 11, 31, 23,59,59)` = **2026-12-31T22:59:59Z**.

Die AfA-Automatik schreibt `entryDate = Date.UTC(year, month, 0, 23,59,59)`
(`depreciation.ts:175`) = **2026-12-31T23:59:59Z** → **außerhalb**.

**Zahlenbeispiel:** Plan 100.000 €, gebucht 12 × 8.333,33 € → Bericht zeigt Ist
**91.666,67 €** und meldet „8,3 % unter Plan". Umgekehrt rutschen Buchungen vom 31.12. des
Vorjahres 23:00–24:00 UTC in den Jahresanfang.

### F23 — P1 · Kreditorenkonten landen in `COST_FINANCING`
`src/lib/accounting/reports/budget-comparison.ts:112`

```ts
if (line.account >= range.from && line.account < range.to)
```
**String**-Vergleich über verschieden lange Kontonummern. `COST_FINANCING` = 7000–7600.
Ein Kreditorenkonto `"70001"` erfüllt `"70001" >= "7000"` **und** `"70001" < "7600"`.

**Zahlenbeispiel:** Kreditor 70001 mit 200.000 € Jahresumsatz erscheint vollständig als
Finanzierungskosten. Bei 40.000 € geplantem Zinsaufwand: **+500 % Planüberschreitung**.
Alle Personenkonten 70000–75999 betroffen.

### F24 — P1 · Kostenstellen-Hierarchie wird nirgends aufgerollt
`prisma/schema.prisma:4137-4139` vs. `budget-comparison.ts:133`, `reports/costcenter.ts:105`

Beide Auswertungen matchen auf den **exakten** Kostenstellen-String. Doppelzählung gibt es
*nicht* — dafür das Gegenteil: eine Budgetzeile auf der Elternkostenstelle sieht die
Ist-Buchungen der Kinder nie.

**Zahlenbeispiel:** KST `100` mit Kindern `110`/`120`. Budget 500.000 € auf `100`, alle
Buchungen auf den Kindern → Bericht zeigt Ist **0 €**, Abweichung **−100 %**.

*Nebenbefund:* `JournalEntryLine.costCenter` wird aus `item.datevKostenstelle` befüllt
(`auto-posting.ts:156 ff.`), gejoint wird gegen `CostCenter.code`. Weichen die Nummernkreise
ab, ist das Ist flächendeckend 0.

### F25 — P1 · SKR04-Mandanten: Erlöse als Aufwand
`src/lib/accounting/reports/costcenter.ts:94-95`

```ts
const isRevenue = line.account.startsWith("8");
const isExpense = line.account >= "3" && line.account < "8";
```
Hart auf SKR03 verdrahtet, obwohl `skr04-mapping.ts` existiert. In SKR04 sind
Umsatzerlöse **4xxx**.

**Zahlenbeispiel:** SKR04-Mandant, 500.000 € Erlöse auf 4400 → Bericht: Erlös 0 €,
Aufwand 500.000 €, Ergebnis **−500.000 €** statt +500.000 € — **1.000.000 € Fehler**.

---

## 5. Testabdeckung

- **`src/lib/lease-revenue/calculator.ts` hat kein Testfile.** Weder
  `calculateSettlementFees` noch `calculateAdvanceFees` noch `loadSettlementData` sind
  getestet — und genau dieser Calculator persistiert die `LeaseRevenueSettlementItem`-Zeilen
  und speist die Rechnungen.
- **`settlement/calculator.test.ts` testet nur den Verteiler.** 25 Tests, alle auf
  `calculatePlotArea` und `formatAddress`. Die Ökonomie — MAX(Mindest/Umsatz),
  Vorschussverrechnung, Brutto/Netto, Mehrfachpächter — ist **komplett ungetestet**.
  `calculateMonthlyAdvance`: 0 Tests.
- **Kein Test prüft `weaShare + poolShare = 100`** oder ob die Summe der Item-Beträge dem
  Topf entspricht. Genau solche **Invarianten-Tests hätten F1, F3 und F10 sofort gefunden.**
- **`afa.test.ts` ist gut gebaut, zementiert aber die Fehler.** Der Test
  „12 Monate × 10 € = 120 € jährlich" funktioniert nur, weil das Testasset im Januar
  angeschafft wird — bei November-Anschaffung (F14) würde er fehlschlagen. Für
  `DECLINING_BALANCE` wird nur die Verbotslogik ab 2023 getestet, **kein einziger Test
  prüft einen Abschreibungsbetrag** gegen einen Rechtsstand.
- `dunning.test.ts` / `interest.test.ts` decken §288 solide ab, testen
  `computeDefaultInterest` aber isoliert mit festem `baseRatePercent` → gehen an F17 vorbei.

---

## Geprüft und für **korrekt** befunden

- **MAX(Mindestpacht, Umsatzpacht)** — in beiden Calculatorn richtig. `settlement` bildet
  das Maximum je Turbine, `lease-revenue` auf Parkebene; wegen
  `max(R/n, M) × n = max(R, M×n)` äquivalent. ✅
- **Erlösphasen-Zuordnung** — `yearsInOperation = settlementYear − commissioningYear + 1`,
  `endYear = null` als offenes Ende. In beiden Dateien identisch, 1-basiert, kein
  Off-by-one. ✅
- **`getIntervalDivisor`** — MONTHLY 12 / QUARTERLY 4 / YEARLY 1 korrekt;
  `calculateAdvanceFees` teilt konsistent **auch die Zuschläge** durch denselben Divisor,
  sodass 12 Vorschüsse exakt die Jahressumme ergeben. ✅
- **`getBaseRateAt`** — korrekte Point-in-Time-Semantik. Geseedete Werte stimmen mit den
  amtlichen §247-BGB-Sätzen überein (3,62 % ab 01/2024, 2,27 % ab 01/2025, 1,27 % ab
  07/2025). ✅
- **§288 BGB Grundformel** — B2B 9 PP / B2C 5 PP korrekt getrennt, 40-€-Pauschale nur B2B
  und einmalig pro Forderung (nicht je Mahnstufe), Zinsen auf den Bruttobetrag (rechtlich
  richtig), `daysSince` UTC-normalisiert. ✅
- **Skonto** — Bemessung vom **Brutto**betrag ist korrekte deutsche Praxis. Ganzzahlige
  Cent-Arithmetik vermeidet Float-Drift, `isSkontoValid` nutzt `setUTCHours`. Die
  USt-Korrektur nach §17 UStG liegt sauber getrennt in `ust-adjustment.ts`. ✅
- **AfA pro rata temporis (linear)** — Anschaffungsmonat voll, Abgangsmonat nicht: exakt
  R 7.4 EStR. Monatsvergleiche durchgängig UTC. ✅
- **AfA-Idempotenz** — Prüfung auf bestehende (Jahr, Monat)-Schedule-Rows verhindert
  Doppelbuchungen; Periodensperren-Gate atomar pro Asset. ✅
- **Verfügbarkeits-Aggregation über die Flotte** — korrekt als Summe-der-Summen
  (zeitgewichtet), nicht als Mittel der Anlagen-Prozentwerte. ✅
- **Energieumrechnung im SCADA-SQL** — `SUM(powerW × 10.0 / 60.0 / 1000.0)`: Einheitenkette
  für 10-Minuten-Mittelwerte korrekt. ✅
- **`buildDateRange`** — halboffenes UTC-Intervall, im SQL konsequent `>= from AND < to`.
  Keine Doppelzählung an Jahresgrenzen, schaltjahrsicher. (Der Fehler in F20 liegt darin,
  dass `hoursInPeriod` dieses volle Intervall als Nenner nimmt.) ✅
- **`calculateTrend`** — Division durch 0 abgefangen. ✅

---

## Empfehlung

Dringendste Punkte: **F1–F5** und **F8**. Der lease-revenue-Pfad rechnet bei Mehrfachpacht,
Einmalentschädigungen und Ausgleichsflächen strukturell falsch, und die Vorschussverrechnung
mischt Brutto mit Netto.

**Vor jedem Fix ein Invarianten-Test**, der prüft dass
`Σ subtotalEur == actualFeeEur + Σ Zuschläge`. Der fällt bei F1, F3 und F10 sofort um und
schützt danach dauerhaft.

# Regressionsprüfung: die eigenen Fixes

> Stand 2026-07-29 · Geprüft: 5 Commits mit ~195 Fixes
> **6 belegte Regressionen, 3 davon mit Geldbezug · 5 von 10 Prüfpunkten sauber**

Geprüfte Commits: `f7e8333` (Save-Audit, 80) · `0e74606` (P0, 24) · `06f73a6` (P1, 44) ·
`261e9af` (P2, 15) · `ac90a98` (Architektur-Refactor)

**Vorab zur Entwarnung:** Die Soft-Delete-Sorge ist zu ~80 % unbegründet. Es gibt eine
globale Prisma-Extension (`src/lib/prisma.ts:83-124`), die
`findMany`/`findFirst`/`findFirstOrThrow`/`count` für Contract, Lease, Fund, Park und
Document automatisch filtert. Die Lücken liegen woanders — siehe F5.

---

## F4 · P1 — `updateWithAudit` schreibt IBANs und SMTP-Passwörter im Klartext ins AuditLog

**Commit** `0e74606` · **Datei** `src/lib/audit-update.ts:108-129`

`loadCurrent` und `applyChange` laufen über den **erweiterten** Prisma-Client —
`withEncryption` (`encryption-middleware.ts:243-251`) entschlüsselt beim Lesen.
`diffRecords` vergleicht die Klartext-Werte und schreibt sie unverändert in
`auditLog.oldValues` / `newValues` (JSON-Spalte, **unverschlüsselt**). Kein `ignoreFields`
gesetzt — repo-weit 0 Treffer.

**Betroffen**
- `src/app/api/persons/[id]/route.ts:164` → `Person.bankIban`, `bankBic`, `bankName`
- `src/app/api/funds/[id]/route.ts:296` → `Fund.emailSmtpPassword`

**Die Ironie:** Die Fund-PUT-Route strippt das Passwort sorgfältig aus der Response
(`funds/[id]/route.ts:334-338`) — und schreibt es zwei Zeilen vorher im Klartext in die
AuditLog-Tabelle. Vorher loggte Fund-PUT nur `name`/`legalForm`/`status`, Person-PATCH gar
nichts. **Wir haben mit dem Fix „SMTP-Passwörter verschlüsseln" gleichzeitig einen neuen
Klartext-Pfad geschaffen.**

**Wirkung** Ein DB-Dump oder Backup-Export enthält alle jemals geänderten IBANs und
SMTP-Passwörter unverschlüsselt.

**Fix** `ignoreFields` in `updateWithAudit` setzen. Trivial.

---

## F1 · P1 — `calculateTaxAmounts` ist NICHT verhaltensgleich

**Commit** `ac90a98` · **Datei** `src/lib/invoices/numberGenerator.ts:342-348`

- **Alt:** `taxAmount = round2(net * rate)`, `gross = round2(net + net*rate)` — gerechnet
  auf dem **ungerundeten** Netto
- **Neu:** `combineNet()` rundet Netto **zuerst** auf Cent (`netCents = round(net*100)`),
  dann Steuer darauf

**Empirisch verifiziert** (Node, echtes `@prisma/client-runtime-utils`):

```
net=100.567 @19%  → ALT tax 19.11 / gross 119.67   NEU tax 19.11 / gross 119.68  ← 1 Cent
net=2.675   @19%  → ALT gross 3.18                 NEU gross 3.19
```

**Bruchszenario** `admin/settlement-periods/[id]/create-invoices/route.ts:954` ruft
`calculateTaxAmounts(plotArea.calculatedAmount, taxType)`. `calculatedAmount` ist
**ungerundet** — siehe `settlement/calculator.ts:1087`
(`paymentPerTurbine * weaPct/100 * turbineCount * ratio`, ratio = 1/n) und `:1115`
(`areaSqm * wegRate`). Pro PlotArea-Position kann der Bruttobetrag 1 Cent abweichen;
`totalGross += tax.grossAmount` akkumuliert das über alle Positionen. **Nachberechnete
Abrechnungen weichen gegen bereits versandte Rechnungen ab.**

**Warum die Tests das nicht gefangen haben** `tax-split.test.ts:21` importiert
ausschließlich aus `./tax-split`. Die 36 Goldmaster-Tests decken `calculateTaxAmounts` und
`calculateItemAmounts` **null** ab. Die Commit-Message („Bug-Kompatibilität: 36
Goldmaster-Tests grün") deckt **1 von 3 Delegationen**.

---

## F2 · P1 — `splitNetAmount` bricht die Invariante `net + tax === gross`

**Commit** `ac90a98` · **Datei** `src/lib/accounting/tax-split.ts:120-130`

```ts
const { gross, tax } = combineNet(new Decimal(net), spec.rate);
const netNum   = round2(net);        // Math.round(net*100)/100  → Float-Semantik
const grossNum = gross.toNumber();   // Decimal.ROUND_HALF_UP    → exakte Dezimal-Semantik
```

**Zwei verschiedene Rundungspfade für dieselbe Zahl.**
`Math.round(1.005*100)` = 100 (weil `1.005*100 === 100.49999999999999`),
`Decimal(1.005).mul(100)` = 100.5 → 101.

**Verifiziert** `splitNetAmount(1.005, rate 7%)` → net 1.00, tax 0.07, **gross 1.08**.
Alt: 1.00 / 0.07 / **1.07**.

Der Test-Block „Rundungs-Invariante" (`tax-split.test.ts:166`) testet **nur**
`splitGrossAmount` — `splitNetAmount` hat keinen Invarianz-Test.

---

## F3 · P2 — `splitGrossAmount` divergiert bei negativen Beträgen

**Commit** `ac90a98` · **Datei** `src/lib/accounting/money.ts:80-92`

`Math.round(-x.5)` rundet Richtung +∞, `Decimal.ROUND_HALF_UP` rundet von Null weg.
**Verifiziert** `gross = -100.005 @19%` → ALT `net -84.03`, NEU `net -84.04`.

**Bruchszenario** `ust-adjustment.ts:129` ruft
`splitGrossAmount({ gross: params.grossDelta }, …)`. Der Kommentar darunter sagt explizit:
*„Skonto auf Ausgangsrechnung (grossDelta **NEGATIV**)"*. **§17-USt-Korrekturbuchungen
laufen durch genau diesen Pfad.** Kein Test mit negativen Werten vorhanden.

---

## F5 · P1 — Soft-Delete leakt über verschachtelte `_count`-Guards

**Commits** `0e74606` (Contract/Lease), `261e9af` (Fund)

Die Soft-Delete-Extension patcht nur **Top-Level**-Reads. Verschachtelte Relation-Reads
(`include: { _count: … }`) werden **nicht** gefiltert. Vor `0e74606` existierten keine
soft-deleted Contract/Lease-Zeilen — die Lücke war schlafend. **Jetzt ist sie scharf.**

| Datei:Zeile | Effekt |
|---|---|
| `persons/[id]/route.ts:214-236` | Person-DELETE-Guard summiert `_count.leases + _count.contracts`. Eine Person, deren Verträge alle soft-gelöscht sind, ist **dauerhaft unlöschbar** — die Fehlermeldung nennt „2 Pachtverträge", die UI zeigt null. |
| `parks/[id]/route.ts:331-356` | Park-DELETE blockiert wegen soft-gelöschter Verträge, obwohl keine sichtbar sind |
| `parks/route.ts:99-100` | `contractCount` in der Park-Liste zählt gelöschte mit (P2) |
| `persons/route.ts:63` | `_count.leases` in der Personenliste, dito (P2) |

**Nicht betroffen** (geprüft): `contracts/route.ts:159` groupBy hat explizit
`deletedAt: null`; `analytics/index.ts:107` filtert auf `status: ACTIVE` (Fund-Soft-Delete
setzt zusätzlich `INACTIVE` — deckt es zufällig ab); alle `.count()`-Aufrufe laufen durch
die Extension.

---

## F6 · P1 — `assertPeriodOpen` blockiert Bankauszug-Zuordnung aus geschlossenen Monaten

**Commit** `0e74606` · **Datei** `src/lib/accounting/invoice-payment.ts`

Der Check läuft gegen `params.paymentDate` — und **zwei von vier Callern übergeben ein
historisches Datum**:
- `buchhaltung/bank/transactions/[id]/route.ts:94` → `paymentDate: bt.bookingDate`
- `invoices/bank-import/confirm/route.ts:127` → `paymentDate: new Date(conf.paidAt)`

**Bruchszenario** Buchhaltung schließt Juni am 5. Juli. Am 10. Juli wird der
Juni-Kontoauszug importiert → **jede Zuordnung schlägt mit `PeriodLockedError` fehl**,
weil die Zahlung ins gesperrte Juni fällt. Vorher ging das.

Derselbe Klassenfehler wie Finding 1.4 in `AUDIT-2026-07-PROZESSKETTEN.md`, nur an
`recordPayment` statt am Storno.

**Entschärfend** Alle vier Routen fangen `PeriodLockedError` sauber ab → saubere 409/400,
keine 500er.

**Zusatz (P2)** `period-lock.ts:51-52` nutzt `getUTCFullYear()/getUTCMonth()`. Ein
`paymentDate`, das als deutsche Lokalzeit-Mitternacht entsteht (`new Date(2026, 6, 1)` =
`2026-06-30T22:00Z`), landet im **Vormonat** — der 1. Juli wird gegen das Juni-Lock
geprüft.

---

## Bilanz: was sauber war

| # | Prüfpunkt | Ergebnis |
|---|---|---|
| 1 | Tax-Zentralisierung | **3 Findings** (F1–F3). `invoice-correction.ts` ist als einzige der drei Delegationen sauber — `calculateItemAmounts` rundet Netto per `round2()` **vor** `combineNet`, damit ist `netCents` bereits ganzzahlig und der Pfad äquivalent. |
| 2 | **Turbine-Dialoge** | **Sauber.** Per Diff verifiziert: Feldliste (23 State-Keys) identisch, `buildSubmitPayload` Feld-für-Feld identisch zu beiden Alt-Payloads, `htmlFor`-Set identisch, `t("…")`-Key-Set **in beide Richtungen leer** (kein Key verloren, keiner erfunden). `useEffect`-Deps und Lade-Zeitpunkte unverändert. |
| 3 | Soft-Delete-Reads | **F5** — aber nur bei verschachtelten `_count`. Alle Top-Level-Listen, Exports und Reports sind durch die Extension abgedeckt. |
| 4 | `updateWithAudit` | **F4.** Die Transaktions-Semantik selbst ist korrekt: Update + Plot-Diff + AuditLog laufen weiterhin in *einer* `$transaction`; Lease-PATCH hat die LeasePlot-Diff-Logik unverändert übernommen; Person-PATCH schreibt exakt dieselben Felder wie vorher. |
| 5 | Optimistic Locking | **Sauber.** `expectedUpdatedAt` optional, Check nur bei gesetztem Wert, `updatedAt` nur konditional in der WHERE. Kein Frontend sendet das Feld — der PoC ist aktuell wirkungslos, bricht aber nichts. |
| 6 | Idempotency-Wrapper | **Sauber.** Ohne Key → `return handler()`. Key kommt **nur** aus explizitem Header oder Body-Feld — nie aus einem Payload-Hash, zwei echte Teilzahlungen kollidieren also nicht. Nur 2xx wird gecacht, Exception löscht den Slot. Body wird in allen 3 Routen *vor* dem Wrapper geparst → kein Double-Read. |
| 7 | `assertPeriodOpen` | **F6.** |
| 8 | `enumParam` | **Sauber.** Alle Allow-Lists 1:1 gegen `schema.prisma` geprüft: ContractType (6/6), ContractStatus (5/5), OperationalTaskStatus (4/4), Turbine-Status (3/3). Kein gültiger Wert fällt raus. Verhaltensänderung nur bei *ungültigen* Werten: vorher 500, jetzt still verworfen → volle Liste statt Fehler (P2-informativ). |
| 9 | `sidebar/counts` | **Sauber.** `permissions.ts:83-155`: `checkPermission(userId, perm)` **ohne** `resourceType`/`resourceId` — der Restriction-Zweig wird nie betreten, die Funktion returned `hasPermission: hasPerm`, was exakt `permissions.includes(perm)` ist. Keine Logik verloren. |
| 10 | Sonstige | **Sauber**, mit P2-Anmerkungen unten. |

### P2-Anmerkungen (kein Bruch, aber Risiko)

- **`documents/route.ts`** — `getString()` sauber, Pflichtfeld-Check auf `title`/`category`
  intakt und sogar vorgezogen ✓
- **`documents/[id]/content`** — lokaler Fallback (`:149-206`) unverändert Buffer-basiert
  mit eigenen Headers, unabhängig vom neuen S3-Stream ✓
- **`useDashboardConfig`** — heute wird **nichts** gedroppt (Zod-Enum hat 7 Werte, Registry
  nutzt 5, alle 42 Widgets haben `description`). *Kopplungsrisiko:* eine neue
  `WidgetCategory` ohne Hook-Update lässt Widgets stillschweigend verschwinden.
- **`plots` POST** — einzige Verschärfung: `.optional()` ist **nicht** `.nullable()`.
  Ein Client, der explizit `geometry: null` sendet, bekommt jetzt 400.
- **`getEmailConfig`** — Invalidierung greift (`setConfig:639`, `deleteConfig:914`, löscht
  Tenant- *und* Global-Scope). *Abhängigkeit:* der Aufrufer muss `category: "email"`
  mitgeben; Seed-/Migrationsskripte mit falscher Kategorie hinterlassen bis zu 30 s stale
  SMTP-Credentials.
- **`turbines` POST/PUT** — `technicalData` auf Primitive verschärft; verschachtelte
  Objekte werden jetzt mit 400 abgelehnt. Die Dialoge senden das Feld nicht — betrifft nur
  API-/Import-Clients.

---

## Empfohlene Reihenfolge

**F4** (Datenschutz, trivialer Fix via `ignoreFields`) →
**F1/F2** (Geld — Goldmaster-Tests auf `calculateTaxAmounts` und `calculateItemAmounts`
ausweiten, *bevor* korrigiert wird) →
**F5** (`_count`-Guards) →
**F6** (Policy-Entscheidung: soll eine Zahlung aus einem geschlossenen Monat zugeordnet
werden dürfen?) →
**F3**

---

## Lehre für künftige Refactorings

Der Turbine-Dialog-Refactor (−76 % LOC) war **vollständig sauber** — nachweisbar, weil er
rein struktureller Natur war und die Payloads Feld für Feld vergleichbar blieben.

Die Tax-Zentralisierung war es **nicht**, obwohl sie mit Goldmaster-Tests abgesichert
schien. Die Tests deckten nur eine von drei Delegationen ab. **Bei Refactorings mit
Rechenanteil muss die Testabdeckung vor dem Umbau auf alle betroffenen Einstiegspunkte
ausgeweitet werden — nicht nur auf den, der zufällig schon Tests hatte.**

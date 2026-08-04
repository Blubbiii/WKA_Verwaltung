# Audit: Prozessketten (Rechnung, Mahnwesen, Pacht, Gesellschafter, Angebot, Dokument)

> Stand 2026-07-29 · **Nur Befund, nichts gefixt** · Alle Funde am Code verifiziert

Geprüft wurde, wo Schritt N den Schritt N+1 kaputtmacht. Sechs Ketten, davon fünf
vollständig.

Die Kette **SCADA → Abrechnung** ist separat auditiert:
[AUDIT-2026-07-SCADA-ABRECHNUNGSKETTE.md](AUDIT-2026-07-SCADA-ABRECHNUNGSKETTE.md)

---

## Kette 1 — Rechnung → Zahlung → Buchung → Periodenabschluss

### 1.1 — P0 · Die Zahlungsbuchung (Bank an Forderung) wird NIE erzeugt

Der schwerwiegendste Befund des gesamten Audits.

**Bruchstelle**
- `src/app/api/buchhaltung/bank/transactions/[id]/route.ts:102-106` — TODO:
  *„die Bank-Konto-Gegenbuchung folgt beim nächsten Auto-Posting-Lauf"*
- `src/lib/accounting/auto-posting.ts:89-277` — `createAutoPosting()` bucht
  **ausschließlich** `Invoice → SENT` (Forderung an Erlös). **Kein Payment-Zweig.**
- `src/lib/accounting/invoice-payment.ts:148-170` — `recordPayment()` schreibt
  `InvoicePayment` + `paidAmount`, aber **keinen `JournalEntry`**. Der Parameter
  `journalEntryId` (`:51`/`:156`) wird von **keinem** der 4 Caller je befüllt.

**Beleg** `journalEntry.create` existiert im Codebase 6×: Invoice-Buchung, Invoice-Storno,
§17-Korrektur, AfA, Periodensperren-Storno, manuelle Buchung. **Kein einziger
Zahlungsbezug.** `referenceType: "Payment"|"InvoicePayment"|"BankTransaction"` → 0 Treffer.

**Szenario** Rechnung 1.000 € versenden → Auto-Posting bucht 1400 an 8400. Kunde zahlt →
Bank-Match → `InvoicePayment` + `status=PAID`. **Konto 1400 bleibt mit 1.000 € belastet,
das Bankkonto bleibt bei 0.**

**Auswirkung** Bilanz, SuSa und BWA zeigen dauerhaft **alle je gestellten Rechnungen als
offene Forderung**, das Bankkonto ist leer. Nach einem Jahr Betrieb ist die Buchhaltung
strukturell unbrauchbar — inklusive DATEV-Export, E-Bilanz und GoBD. Die
Offene-Posten-Sicht aus `Invoice.status` und die Sicht aus dem Hauptbuch driften
vollständig auseinander.

### 1.2 — P0 · `unmatch` rollt die Zahlung nicht zurück → Geld doppelt verbucht

**Bruchstelle** `bank/transactions/[id]/route.ts:144-164` (TODO im Code benannt) gegen
`:90-99` (match legt `InvoicePayment` an).

**Szenario**
1. Bank-TX 1.000 € auf Rechnung A matchen → A: `paidAmount=1000`, `PAID`
2. Falsche Rechnung bemerkt → `unmatch` → Bank-TX `UNMATCHED`, aber **A bleibt PAID, der
   `InvoicePayment` bleibt stehen**
3. Dieselbe Bank-TX auf Rechnung B matchen → B ebenfalls PAID

**Zustand** 1.000 € Bankeingang haben 2.000 € Forderung getilgt. Nicht über die UI
korrigierbar — es gibt keinen Payment-Delete-Endpoint.

### 1.3 — P1 · Storno kann den falschen JournalEntry treffen

**Bruchstelle**
- `auto-posting.ts:100-107` (`existing`-Check) und `:291-300` (`original`-Lookup): beide
  `findFirst({ referenceType:"Invoice", referenceId, source:"AUTO" })` **ohne `orderBy`**
- `ust-adjustment.ts:207-220`: die §17-Korrekturbuchung trägt **exakt dieselben** Merkmale

**Szenario** Rechnung senden (E1) → Zahlung mit Skonto erzeugt §17-Buchung (E2) → Storno.
`reverseAutoPosting` liefert bei undefinierter Reihenfolge ggf. E2 → **die
Skonto-Korrektur wird storniert statt der Umsatzbuchung.** E1 bleibt für immer im Hauptbuch.

Zweiter Pfad: Schlug `createAutoPosting` beim Senden wegen gesperrter Periode fehl
(`:227-238`) und entsteht später eine §17-Buchung, liefert der `existing`-Check beim Retry
`{success:true}` mit der §17-ID → **die Umsatzbuchung wird nie nachgeholt**, unsichtbar.

### 1.4 — P1 · Storno aus gesperrter Periode unmöglich — Prüfung passt nicht zur Buchung

`invoices/[id]/cancel/route.ts:59` prüft `assertPeriodOpen(original.invoiceDate)` — aber
`reverseAutoPosting` bucht laut `auto-posting.ts:329-332` bewusst in den **aktuellen**
Monat.

**Szenario** Rechnung vom 15.03., Periode 2026-03 am 10.04. geschlossen. Am 20.04. Storno
nötig → **409 PERIOD_LOCKED**, obwohl das Storno gar nicht in den März buchen würde.
Einziger Ausweg: Periode entsperren — genau das, was §146 AO verhindern soll.

### 1.5 — P1 · Storno einer bezahlten Rechnung: keine Rückabwicklung

`cancel/route.ts:47-53` prüft nur `CANCELLED`/`DRAFT`. **Kein Check auf `paidAmount > 0`.**

**Szenario** Rechnung 1.000 €, voll bezahlt, dann Storno → Original `CANCELLED` mit
`paidAmount=1000`, `InvoicePayment` bleibt. Zusätzlich Storno-Gutschrift −1.000 € mit
`status=SENT`, `paidAmount=0`.

**Auswirkung** Die erhaltenen 1.000 € sind buchhalterisch nirgends zugeordnet. Die
Storno-Gutschrift steht dauerhaft als offener Posten −1.000 € — nicht schließbar, weil
`recordPayment` nur `amount > 0` akzeptiert (`invoice-payment.ts:75-77`).

### 1.6 — P1 · `reverseAutoPosting` läuft fire-and-forget außerhalb der TX

`cancel/route.ts:166-168` — `.catch(logger.warn)` nach dem `$transaction`-Block.

Schlägt es fehl, ist die Rechnung storniert, die Umsatzbuchung lebt weiter, **der User
erfährt nichts**. Ein zweiter Versuch ist blockiert („bereits storniert") → die
Reversal-Buchung kann nie nachgeholt werden.

### 1.7 — P1 · `WRITTEN_OFF` blockiert den Periodenabschluss dauerhaft

`admin/settlement-periods/[id]/close/route.ts:58-71` — `status: { notIn: ["PAID","CANCELLED"] }`.
**`WRITTEN_OFF` fehlt.**

Pächter insolvent → Forderung ausgebucht → Periode kann **nie** geschlossen werden.

### 1.8 — P1 · Write-off: drei Teilbrüche

`src/lib/accounting/write-off.ts:84-90`, `:95-115`; Route `write-off/route.ts:25-31`

- **`PAID` ist nicht ausgeschlossen** → §17-USt-Korrektur auf tatsächlich vereinnahmtes
  Geld = Steuerverkürzung
- **Kein Cap gegen `grossAmount − paidAmount`** → Abschreibung von 5.000 € auf eine
  1.000-€-Forderung wird akzeptiert
- **Ohne `taxCodeId` entsteht überhaupt kein `JournalEntry`.** Der Header-Kommentar
  (`:15-16`) verweist auf einen „Caller-seitigen JournalEntry-Manager" — die Route ruft
  keinen. Da `createAutoPosting` `taxCodeId` nie setzt, ist das der **Normalfall**: die
  Forderung steht weiter voll in der Bilanz, während die Rechnung `WRITTEN_OFF` ist.

---

## Kette 2 — Mahnwesen

### 2.1 — P1 · Zwei parallele Mahnsysteme → doppelte Mahnungen

- **System A** `src/lib/accounting/dunning.ts:130` → liest `DunningItem.level`
- **System B** `src/app/api/invoices/[id]/send-reminder/route.ts:96-102`, `:199` →
  liest/schreibt `Invoice.reminderLevel`

`dunning.ts` liest `Invoice.reminderLevel` **nie**; `send-reminder` liest `dunningItems`
**nie**. Beide sind über die UI erreichbar.

**Szenario** Mahnlauf Stufe 1 → `DunningItem.level=1`, `Invoice.reminderLevel` bleibt
`null`. Sachbearbeiter öffnet die Mahnliste, sieht `nextReminderLevel=1` und versendet →
**Kunde bekommt dieselbe 1. Mahnung zweimal.**

### 2.2 — P1 · Mahngebühren und Verzugszinsen werden nie zur Forderung

`dunning.ts:220-231` schreibt `feeAmount`/`interestAmount` ausschließlich auf `DunningItem`.
`send-reminder/route.ts:104-110`, `:165` schickt `lateFee` nur in die E-Mail.

**Beleg** `feeAmount`/`interestAmount` kommen in keinem Invoice-, InvoiceItem- oder
JournalEntry-Create vor.

**Szenario** Mahnung 1.000 € + 5 € Gebühr + 12,40 € Zinsen. Kunde überweist 1.017,40 € →
`recordPayment` wirft **`OverpaymentError`**, weil `grossAmount` nur 1.000 € ist.
**Die korrekte Zahlung ist im System nicht erfassbar.**

### 2.3 — P1 · Teilzahlung wirft die Rechnung aus dem Mahnpfad

- `send-reminder/route.ts:90-92`: `if (invoice.status !== "SENT") → 400`
- `invoices/reminders/route.ts:27`: `status: "SENT"`
- Gegenstück: `dunning.ts:92` schließt `PARTIALLY_PAID` korrekt **ein**

**Szenario** 1.000 €, Kunde zahlt 100 € → `PARTIALLY_PAID` → Rechnung verschwindet aus der
Mahnliste. **Die 900 € Restforderung wird über diesen Pfad nie wieder gemahnt.**

### 2.4 — P1 · Gemahnt wird der Bruttobetrag, nicht der Restbetrag

`dunning.ts:224` — `amount: c.grossAmount`. Der korrekt berechnete `openAmount` (`:141-144`)
wird nur für die Zinsen genutzt. Ebenso `send-reminder/route.ts:143`.

Kunde zahlt 900 € von 1.000 € → Mahnung fordert weiterhin 1.000 €. Rechtlich angreifbar.

### 2.5 — P1 · `dunningHold` wird vom Invoice-Mahnpfad ignoriert

`dunning.ts:95-99` filtert korrekt. `invoices/reminders/route.ts:24-30` und
`send-reminder/route.ts:70-84` prüfen es **gar nicht** → der Hold ist wirkungslos.

---

## Kette 3 — Pachtvertrag → Flurstück → Abrechnung → Rechnung

### 3.1 — P0 · Teilbezahlte Vorschüsse werden nicht verrechnet → doppelte Zahlung

`admin/settlement-periods/[id]/create-invoices/route.ts:673` —
`status: { in: ["DRAFT", "SENT", "PAID"] }`. Der Enum kennt 6 Werte
(`schema.prisma:3025-3034`): **`PARTIALLY_PAID` und `WRITTEN_OFF` fehlen.**

**Szenario**
1. 12 Vorschüsse à 500 € = 6.000 € ausgezahlt
2. Bei einem Vorschuss Teilzahlung erfasst (Bank-Match mit abweichendem Betrag warnt nur
   und bucht, `bank/transactions/[id]/route.ts:74-84`) → `PARTIALLY_PAID`
3. Endabrechnung: Jahresentgelt 7.000 €. Verrechnungsschleife (`:985-1020`) sieht nur
   11 Vorschüsse → zieht 5.500 € ab

**Ergebnis** Gutschrift 1.500 € statt 1.000 €. **Echter Geldabfluss**, pro Pachtvertrag,
jedes Jahr. Kein Alarm, kein Log.

### 3.2 — P1 · Storno-Gutschrift blockiert den Korrektur-Workflow dauerhaft

Idempotenz-Filter `create-invoices/route.ts:401-413` (ADVANCE) und `:879-890` (FINAL):
`status: { not: "CANCELLED" }`. Gegenspieler: `cancel/route.ts:94-123` erzeugt die
Storno-Rechnung mit gleicher `leaseId` (`:118`), gleicher `settlementPeriodId` (`:120`)
und `status: "SENT"` (`:112`).

**Szenario** Gutschrift falsch → Storno. Der Kommentar bei `:399-400` verspricht
*„CANCELLED Invoices werden durch eine neue ersetzt (typischer Korrektur-Workflow)"*. Der
Re-Run findet aber die **Storno-Gutschrift** (SENT, nicht CANCELLED) →
`skippedLeases.add(leaseId)` → **für diesen Pachtvertrag wird nie wieder eine Gutschrift
erzeugt.** Stumm: „Alle N Gutschriften wurden bereits in einem früheren Lauf erstellt".

### 3.3 — P1 · Flurstück-Split nach Abrechnung: Teilflächen fallen still heraus

`plots/[id]/split/route.ts:83-124` verschiebt **alle** `LeasePlot`-Relationen auf das
*erste* Teilflurstück und setzt das Original auf `INACTIVE` (`:127-130`). Gegenspieler:
`settlement/calculator.ts:335-340` (`plot.status = "ACTIVE"`) und `:430-434`.

**Szenario** 10 ha POOL wird in 4/3/3 ha gesplittet. Nur Teil 1 erbt den `LeasePlot` →
**Abrechnung vergütet nur noch 4 ha statt 10.** Der Pachtgeber verliert 60 %.

Es gibt keine Vorprüfung, ob bereits `InvoiceItem`s mit `plotId` existieren; einziges
Signal ist ein `logger.warn`.

**Zusätzlich** `plotAreas.createMany` (`:71-77`) kopiert **jeden** areaType proportional
auf **jedes** Teilstück — ein `WEA_STANDORT` wird zu N Standorten. Sobald jemand
LeasePlots nachpflegt, vervielfacht sich `weaCount`.

### 3.4 — P1 · Vertragsende mitten in der Periode: keine Zeitanteiligkeit

`settlement/calculator.ts:439-460` — expliziter TODO plus `console.warn`.

Vertrag endet 31.03.2026 → Pachtgeber erhält **12/12 statt 3/12** des Jahresentgelts. Die
Warnung geht auf `console.warn` statt in den strukturierten Logger und ist im Container-Log
praktisch unsichtbar.

### 3.5 — P1 · Eigentümerwechsel: nichtdeterministischer Empfänger

`settlement/calculator.ts:430-432`, `:776-778` — `.find(lp => lp.lease.status === "ACTIVE")`
ohne `orderBy`, ohne Datumsprüfung.

**Szenario** Flurstück wird zum 01.07. verkauft, neuer Vertrag ACTIVE, alter noch nicht
ENDED (typische Reihenfolge) → zwei ACTIVE LeasePlots. **Wer die Gutschrift bekommt, hängt
von der Zeilenreihenfolge der DB ab** — und kann zwischen Vorschau (`/calculate`) und
Erzeugung (`/create-invoices`) wechseln, weil beide unabhängig neu rechnen.

---

## Kette 4 — Gesellschafter → Ausschüttung → Portal

### 4.1 — P1 · Unterjähriger Ein-/Austritt ignoriert; Anteile werden umverteilt

`funds/[id]/distributions/route.ts:92` (`where: { status: "ACTIVE" }`), `:154-166`.
`Shareholder.entryDate`/`exitDate` existieren, werden hier aber **nie gelesen**.

Verschärfend `:157-158`: `normalizedPercentage = (percentage / totalPercentage) * 100`.

**Szenario** A (10 %) tritt zum 31.03. aus. Ausschüttung im Dezember → A erhält 0 €, und
die verbleibenden 90 % werden auf 100 % **hochnormalisiert** — die anderen bekommen A's
vollen Jahresanteil geschenkt. Wer im November eintritt, erhält den vollen Jahresanteil.

**Auswirkung** Falsche Ausschüttungsbeträge **und falsche KapESt-Bescheinigungen**.

### 4.2 — P1 · Rechnungsnummern vor der Transaktion gezogen → Nummernlücken

`funds/[id]/distributions/[distributionId]/execute/route.ts:83-87` — `getNextInvoiceNumbers`
steht **vor** `prisma.$transaction` (`:90`).

Genau das Anti-Pattern, das der Rest des Codebase bewusst behoben hat — vgl. die
Kommentare in `cancel/route.ts:71-74` und `create-invoices/route.ts:441-443`.

**Szenario** 40 Gesellschafter, TX bricht bei Nr. 27 ab → 40 Nummern vergeben, 0
Gutschriften. Retry zieht die nächsten 40 → **Lücke von 40 Nummern** (§14 UStG).

### 4.3 — P1 · Doppelausführung einer Ausschüttung möglich

`execute/route.ts:74-76` prüft `status !== "DRAFT"` **außerhalb** der TX; gesetzt wird erst
bei `:150-156`. Kein `SELECT … FOR UPDATE` (anders als `invoice-payment.ts:87-89`), keine
Idempotency.

Doppelklick → **jeder Gesellschafter erhält zwei Gutschriften über den vollen Betrag.**

### 4.4 — P1 · Portal zeigt DRAFT-Gutschriften

`execute/route.ts:114` erzeugt Gutschriften mit `status: "DRAFT"`.
`portal/my-distributions/route.ts:54-60` filtert nur `status: { not: "CANCELLED" }`.

Der Gesellschafter sieht die Beträge **bevor sie jemand freigegeben hat**.

### 4.5 — P2 · Portal-Summen unvollständig

`portal/my-distributions/route.ts:79-90` — `totalDistributed` nur aus `PAID`,
`totalPending` nur aus `SENT`. `DRAFT`, `PARTIALLY_PAID`, `WRITTEN_OFF` fallen in keinen
Topf, `distributionCount` (`:108`) zählt aber alle → „3 Ausschüttungen, 0,00 €
ausgeschüttet, 0,00 € ausstehend".

### 4.6 — P2 · `distributionNumber` global unique, aber pro Tenant hochgezählt

`schema.prisma` Model `Distribution`: `distributionNumber String @unique` (kein
`@@unique([tenantId, …])`) gegen `distributions/route.ts:126-133` (count **pro Tenant**).

Tenant B legt seine erste Ausschüttung 2026 an → `AS-2026-001` → **Unique-Verletzung,
500er**. Zusätzlich ist die count-basierte Vergabe racy.

---

## Kette 5 — Angebot → Rechnung

### 5.1 — P2 · `taxRate` geht bei der Konvertierung verloren

`buchhaltung/angebote/[id]/convert/route.ts:66-69` überträgt `netAmount`, `taxAmount`,
`grossAmount`, `currency` — **nicht `quote.taxRate`**. `Invoice.taxRate` hat
`@default(19.00)`.

Angebot mit 0 % (§19 UStG) oder 7 % → **Rechnungskopf trägt 19 %**, Positionen 0 %/7 %.
Die PDF-Positionstabelle nutzt `item.taxRate`, der Kopf `invoice.taxRate` →
widersprüchliche Steuerangabe auf demselben Dokument.

### 5.2 — P2 · Weitere nicht übertragene Felder

Gleiche Stelle: `recipientCountry`, `recipientVatId`, `paymentReference`, `taxCodeId` und
alle Skonto-Felder bleiben leer. **Der fehlende `taxCodeId` ist der Grund, warum ein
späterer Skonto- oder Write-off-Vorgang keine §17-Korrektur erzeugen kann** (siehe 1.8) —
hier hängen Kette 5 und Kette 1 zusammen.

**Sauber:** Positionen inkl. `taxType`/`taxRate`/`taxAmount` vollständig übertragen;
Nummernvergabe in der TX (`:40-45`); Doppelkonvertierung über `ACCEPTED → INVOICED` und
`convertedInvoiceId @unique` wirksam blockiert. ✅

---

## Kette 6 — Dokument → Freigabe → Portal (leichter Durchlauf)

### 6.1 — P2 · Neue Versionen verdrängen die alte nicht aus dem Portal

`documents/route.ts:440-453` legt eine neue Version als **eigene Document-Row** mit
`parentId` an; die Vorgängerversion wird nicht archiviert. `portal/my-documents/route.ts:60-77`
filtert weder `parentId` noch die höchste `version`.

Korrigierte V2 hochgeladen → Portal listet **beide** mit identischem Titel. Lädt ein
Nicht-Admin V2 hoch (→ `DRAFT`), bleibt im Portal nur die veraltete V1 sichtbar, ohne
Hinweis.

**Sauber:** Der Freigabe-Gate funktioniert korrekt — Uploads von Nicht-Admins landen in
`DRAFT` (beide Upload-Pfade konsistent), das Portal liest ausschließlich
`approvalStatus: "PUBLISHED"` plus `isArchived: false`, Zurücksetzen entfernt das Dokument
sofort. ✅

---

## Als sauber befunden

- **`recordPayment()` selbst** — `SELECT … FOR UPDATE` (`:87-89`), durchgängige
  Decimal-Arithmetik, Toleranz aus `getTenantSettings` statt hardcoded,
  Überzahlungs-Guard, Periodensperre innerhalb der TX. **Der zentrale Punkt der Kette ist
  solide — die Brüche liegen ringsherum.** ✅
- **Periodensperre** (`period-lock.ts`) — `assertPeriodOpen` TX-fähig, `reverseJournalEntry`
  erzwingt POSTED, verhindert Doppel-Storno, bucht in den offenen Monat ✅
- **Idempotenz der Zahlungserfassung** — `POST /invoices/[id]/payments` mit
  `withIdempotency` und sauberem Fehler-Mapping ✅
- **Bank-Import-Bestätigung** — pro Rechnung eigene TX, Restbetrag statt Bruttobetrag,
  Batch läuft bei Einzelfehlern weiter, Statusfilter korrekt ✅
- **Rechnungsnummern-Vergabe** in `cancel`, `create-invoices`, `convert` — jeweils in-TX,
  rollback-sicher (Ausnahme: Ausschüttungen, 4.2) ✅
- **Skonto-Pfad in `mark-paid`** — §17-Korrektur und Zahlung atomar in einer TX ✅
- **Mandanten-Isolation im Portal** — Shareholder-Auflösung konsequent über
  `fund: { tenantId }`, kein Cross-Tenant-Leak ✅
- **`dunningHold` im Mahnlauf selbst** inkl. abgelaufener Temp-Holds; §288-BGB-Pauschale
  korrekt nur einmal pro Forderung ✅

---

## Abdeckung

| Kette | Status |
|---|---|
| 1 Rechnung → Zahlung → Buchung → Abschluss | vollständig (inkl. Storno, Teil-/Überzahlung, Write-off) |
| 2 Mahnwesen | vollständig |
| 3 Pacht → Flurstück → Abrechnung | vollständig (Split, Vertragsende, Eigentümerwechsel, Vorschuss) |
| 4 Gesellschafter → Ausschüttung → Portal | vollständig |
| 5 Angebot → Rechnung | vollständig |
| 6 Dokument → Freigabe → Portal | leichter Durchlauf — `approve`-State-Machine, `download-zip` und Paperless-Sync **nicht** geprüft |

**Nicht geprüft:** `plots/merge` (nur Split), `leases/cost-allocation`,
`management-billing`, KapESt-Berechnung.

---

## Empfohlene Reihenfolge zur Behebung

**3.1** (stiller Geldabfluss) → **1.1** (Buchhaltung strukturell) → **1.2**
(Doppelverbuchung) → **4.1/4.3** → **2.2/2.3** → **3.2/3.3**

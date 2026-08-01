# Save-Correctness-Audit — Buchhaltung

Scope: `src/app/api/{journal-entries,invoices,buchhaltung}/**` + `src/app/(dashboard)/{invoices,journal-entries,buchhaltung}/**`
Datum: 2026-07-10 · Domain: **Geld** (höchstes Risiko)

## Top-Findings

### F1 — Journal-Entry POST: KEIN Balance-Check (Soll=Haben)
- Priorität: **[Geld/Compliance]**
- Datei: [src/app/api/journal-entries/route.ts:25-41](src/app/api/journal-entries/route.ts#L25)
- Bug: `refine` prüft nur pro Zeile "entweder Soll ODER Haben", NICHT `Sum(debit) === Sum(credit)`. Unbalancierte DRAFT-Buchungen werden akzeptiert.
- Impact: User speichert Buchung 1000 Soll gegen 900 Haben, POST erfolgreich, erst beim /post/-Aufruf Fehler — DRAFT-Datenmüll im System. PUT hat den Check (Zeile 132-144), POST fehlt.
- Fix: Selbe Decimal-Balance-Validierung wie in `[id]/route.ts:132-144` in POST einbauen.

### F2 — Bank-Import: KEINE Idempotenz
- Priorität: **[Geld]**
- Datei: [src/app/api/buchhaltung/bank/import/route.ts:57-83](src/app/api/buchhaltung/bank/import/route.ts#L57) · Schema [prisma/schema.prisma:4344-4392](prisma/schema.prisma#L4344)
- Bug: `bankTransaction.createMany` ohne Dedup-Check. Model hat KEINE `@@unique([tenantId, bookingDate, amount, bankReference])`.
- Impact: User lädt CAMT-054 zweimal hoch → doppelte Bank-TX → doppelte Match-Vorschläge → doppelte Zahlungserfassung möglich. Vom User im Ticket explizit als Verdacht gemeldet.
- Fix: `@@unique([tenantId, bankReference])` (falls stets vorhanden) oder Fingerprint-Feld + Pre-Insert-Filter der matches.

### F3 — Bank-TX Match: `PAID` ohne `paidAmount`, ohne InvoicePayment, ohne Journal
- Priorität: **[Geld/Compliance]**
- Datei: [src/app/api/buchhaltung/bank/transactions/[id]/route.ts:48-62](src/app/api/buchhaltung/bank/transactions/[id]/route.ts#L48)
- Bug: Match setzt Invoice `status=PAID` + `paidAt`, aber (a) kein `paidAmount = grossAmount`, (b) keine `InvoicePayment`-Row (bricht Audit-Trail, siehe `recordPayment`), (c) keine automatische Bank-an-Forderung-Buchung, (d) kein Betragsvergleich (matched auch wenn Bank-TX 50 € und Rechnung 500 €), (e) 2 Updates OHNE Transaction, (f) kein `deletedAt/CANCELLED/DRAFT`-Check.
- Impact: Reports/Offene-Posten-Liste sehen "PAID" aber `paidAmount=null` → inkonsistent. Über/Unterzahlungen unsichtbar. Bilanz stimmt nicht.
- Fix: `recordPayment(tx, {...})` mit `bankTransactionId` verwenden statt Direkt-Update, alles in `prisma.$transaction`, `matchSource="MANUAL"` + `matchedById` + `matchedAt` setzen.

### F4 — Invoice PATCH Skonto: Partial-Update **löscht** Skonto
- Priorität: **[Geld]**
- Datei: [src/app/api/invoices/[id]/route.ts:213-243](src/app/api/invoices/[id]/route.ts#L213)
- Bug: User sendet nur `{skontoPercent: 3}`. Backend: `skontoDays = null`, `if (skontoPercent && skontoDays)` false → fällt in else, wipe alles inkl. `skontoPaid=false`.
- Impact: Klick auf Skonto-Prozent im UI killt komplette Skonto-Konfiguration statt Merge mit bestehenden Werten.
- Fix: existierende `existing.skontoDays/Percent` fallback: `const days = validatedData.skontoDays ?? existing.skontoDays`.

### F5 — Invoice POST: Hardcoded Steuersätze, ignoriert TaxRateConfig
- Priorität: **[Geld/Compliance]**
- Datei: [src/app/api/invoices/route.ts:151-154](src/app/api/invoices/route.ts#L151) + [src/lib/invoices/numberGenerator.ts:260-278](src/lib/invoices/numberGenerator.ts#L260)
- Bug: `calculateTaxAmounts(net, taxType)` ohne `taxRateOverride` → benutzt `getDefaultTaxRateByType()` (19/7/0 hardcoded). DB-`TaxRateConfig` wird NICHT konsultiert.
- Impact: Tenant mit historischem 16%-Satz (§28 UStG 2020), oder abweichender Satz → UStVA-Falschmeldung.
- Fix: `await getTaxRate(tenantId, taxType, invoiceDate)` vorschalten und übergeben. Betrifft auch [invoices/[id]/items/route.ts:128](src/app/api/invoices/[id]/items/route.ts#L128) und [buchhaltung/angebote/route.ts:100](src/app/api/buchhaltung/angebote/route.ts#L100).

### F6 — Invoice POST: Float-Arithmetik für `totalNet/Tax/Gross`
- Priorität: **[Geld]**
- Datei: [src/app/api/invoices/route.ts:145-158](src/app/api/invoices/route.ts#L145)
- Bug: `totalNet += netAmount` mit rohen JS-Numbers akkumuliert; item-level `taxAmount` wird gerundet, Header-`taxAmount` nicht → Sum(items.taxAmount) ≠ invoice.taxAmount möglich (Cent-Differenz).
- Impact: E-Rechnung/XRechnung-Prüfsummen können anschlagen; UStVA weicht ab.
- Fix: `Decimal.plus()` verwenden, dann am Ende einmal `.toDecimalPlaces(2)`.

### F7 — Client hardcoded `TAX_RATES` und Skonto-Fallback
- Priorität: **[Geld]**
- Datei: [src/app/(dashboard)/invoices/new/page.tsx:67-71](src/app/(dashboard)/invoices/new/page.tsx#L67) und [:120-152](src/app/(dashboard)/invoices/new/page.tsx#L120)
- Bug: `const TAX_RATES = { STANDARD: 19, REDUCED: 7, EXEMPT: 0 }`, sowie `useState(2)` / `useState(7)` als Skonto-Fallback wenn `/api/admin/tenant-settings` still fehlschlägt (`.catch(() => { /* fall back */ })`).
- Impact: Vorschau in UI ≠ Server-Berechnung wenn Tenant abweichende Sätze hat. Verletzt CLAUDE.md-Regel "Business-Werte IMMER aus `getTenantSettings()`".
- Fix: Steuersätze aus `/api/tax-rates` fetchen; Skonto-Fetch-Fehler laut werfen statt still fallback.

### F8 — Kassenbuch POST: Race + Float für `runningBalance` + `entryNumber`
- Priorität: **[Geld/Compliance]**
- Datei: [src/app/api/buchhaltung/kassenbuch/route.ts:81-103](src/app/api/buchhaltung/kassenbuch/route.ts#L81)
- Bug: Kein `$transaction`, kein Row-Lock. Zwei parallele Requests lesen selben `lastEntry` → identisches `entryNumber` (P2002 möglich) und identischer `prevBalance` → einer verliert. `Number(runningBalance) + parsed.amount` = Float-Präzision-Loss.
- Impact: GoBD §146 "chronologisch, vollständig, richtig, geordnet, zeitgerecht" verletzbar. Fehlbetragsdrift.
- Fix: `prisma.$transaction([...])` mit `SELECT ... FOR UPDATE` (raw) auf letzter Kassenzeile, `Decimal` für Balance.

### F9 — Kassenbuch Client: `parseFloat` schluckt deutsches Komma
- Priorität: **[Geld]**
- Datei: [src/app/(dashboard)/buchhaltung/kassenbuch/page.tsx:88](src/app/(dashboard)/buchhaltung/kassenbuch/page.tsx#L88)
- Bug: `parseFloat(form.amount)` — bei `"12,50"` → `12`. Silent-Truncation, User erwartet 12,50 EUR.
- Impact: 50 Cent verschwinden pro Buchung. Über viele Tage kumulierender Kassendifferenz-Bug.
- Fix: `parseFloat(form.amount.replace(",", "."))` wie in [journal-entries/page.tsx:100-102](src/app/(dashboard)/journal-entries/page.tsx#L100) oder Input-Validation vor Submit.

### F10 — Invoice Cancel: keine Periodensperre + fire-and-forget Journal-Reversal
- Priorität: **[Compliance]**
- Datei: [src/app/api/invoices/[id]/cancel/route.ts:57-150](src/app/api/invoices/[id]/cancel/route.ts#L57)
- Bug: Kein `assertPeriodOpen` weder für Original-`invoiceDate` noch für neues Storno-Datum. `reverseAutoPosting(...)` läuft AUSSERHALB der TX als fire-and-forget.
- Impact: Storno von Rechnung in gesperrter Periode möglich. Bei Journal-Reversal-Fehler: Original CANCELLED + Storno vorhanden, aber Auto-Buchung nicht reversed → OP-Liste falsch.
- Fix: `assertPeriodOpen(tenantId, original.invoiceDate)` + `assertPeriodOpen(tenantId, new Date())` vor TX; `reverseAutoPosting` in TX ziehen.

### F11 — Invoice Cancel: kein `deletedAt`-Check
- Priorität: **[Standard]**
- Datei: [src/app/api/invoices/[id]/cancel/route.ts:30-46](src/app/api/invoices/[id]/cancel/route.ts#L30)
- Bug: `findUnique` ohne `deletedAt: null`-Filter → soft-deleted Rechnung kann storniert werden → erzeugt Storno auf zombie-Rechnung.
- Fix: `where: { id, deletedAt: null }` oder Zustandscheck.

### F12 — SEPA Batch: keine `deletedAt`-Filterung + silent-drop
- Priorität: **[Geld]**
- Datei: [src/app/api/buchhaltung/sepa/route.ts:55-74](src/app/api/buchhaltung/sepa/route.ts#L55)
- Bug: `where: { id: {in}, tenantId, status: {in:[SENT,PAID]} }` ohne `deletedAt: null`. Falls User 10 IDs schickt aber nur 3 gültig, werden 7 stillschweigend ignoriert (kein Warn-Response).
- Impact: SEPA-Batch mit weniger Zahlungen als vom User beabsichtigt. Vergessene Auszahlungen an Kommanditisten.
- Fix: `deletedAt: null` + Response `{ droppedIds: [...] }` mit expliziter Warnung.

### F13 — SEPA Batch: Batchnummer via `count+1` (Race)
- Priorität: **[Standard]**
- Datei: [src/app/api/buchhaltung/sepa/route.ts:77-78](src/app/api/buchhaltung/sepa/route.ts#L77)
- Bug: Zwei parallele POSTs = zwei mal `SEPA-2026-0001`. Wenn Unique-Constraint existiert: P2002; sonst Duplikat.
- Fix: Sequenz-Table analog zu InvoiceNumberSequence oder `$queryRaw` mit `SELECT … FOR UPDATE`.

### F14 — SEPA XML: leere `creditorIban` wird nicht abgelehnt
- Priorität: **[Geld]**
- Datei: [src/app/api/buchhaltung/sepa/route.ts:85-87](src/app/api/buchhaltung/sepa/route.ts#L85)
- Bug: `person?.bankIban || ""` — leere IBAN wird ins XML geschrieben. `Number(inv.grossAmount)` verliert Präzision bei Aggregation `totalAmount`.
- Impact: Bank lehnt XML ab; User sieht "Batch erstellt" aber Zahlung schlägt fehl.
- Fix: Pre-Check `if (!person?.bankIban) throw`; `Decimal.plus` für `totalAmount`.

### F15 — Asset PUT Disposal: keine Abgangsbuchung, `disposalProceeds` kann negativ sein
- Priorität: **[Geld/Compliance]**
- Datei: [src/app/api/buchhaltung/assets/[id]/route.ts:8-88](src/app/api/buchhaltung/assets/[id]/route.ts#L8)
- Bug: Setzen von `disposalDate/Proceeds/status=DISPOSED` erzeugt KEINE JournalEntry (Buchwert an AV / Bank an Erlöse / Gewinn/Verlust). Schema erzwingt kein `min(0)`, `disposalProceeds: -100` akzeptiert.
- Impact: Anlagenspiegel + Bilanz stimmen nicht überein; §7 EStG Rest-AfA nicht ausgebucht.
- Fix: `runDisposalPosting()` einbauen (analog `runDepreciation`), `.min(0)` in Schema, `assertPeriodOpen(disposalDate)`.

### F16 — Bank-TX Match: fehlender GoBD-Audit auf `matchSource=MANUAL`
- Priorität: **[Compliance]**
- Datei: [src/app/api/buchhaltung/bank/transactions/[id]/route.ts:48-52](src/app/api/buchhaltung/bank/transactions/[id]/route.ts#L48)
- Bug: Schema hat `matchSource / matchedById / matchedAt` (siehe [prisma/schema.prisma:4363-4367](prisma/schema.prisma#L4363)) mit Kommentar "Bei nachträglicher User-Korrektur muss matchSource auf MANUAL gesetzt werden" — Handler tut es nicht.
- Fix: `matchSource: "MANUAL", matchedById: check.userId!, matchedAt: new Date()`.

### F17 — Angebote POST: Sequenz außerhalb TX (Inkonsistenz zu Invoice-Muster)
- Priorität: **[Standard]**
- Datei: [src/app/api/buchhaltung/angebote/route.ts:95-142](src/app/api/buchhaltung/angebote/route.ts#L95)
- Bug: `getNextQuoteNumber` vor `quote.create` → bei Insert-Fail: "verbrannte" Nummer. Nicht GoBD-pflichtig, aber Konvention verletzt.
- Fix: `getNextQuoteNumberInTx` analog Invoice-Pattern.

### F18 — Journal-Entry POST: `refine` ist logisch schwach
- Priorität: **[Standard]**
- Datei: [src/app/api/journal-entries/route.ts:33-40](src/app/api/journal-entries/route.ts#L33)
- Bug: `(debit > 0) !== (credit > 0)` — wenn beide `undefined` und `0`, false !== false = false (fail); wenn beide undefined, `(undefined!==undefined && ..)` — der Check ist zwar formell korrekt, aber lässt Zeile mit `debit=0, credit=0` versehentlich durch weil Zod's `.optional()` fehlende Felder als undefined behält. Kombinationstest schwer lesbar.
- Fix: expliziter Check: `Number(l.debitAmount ?? 0) > 0 !== Number(l.creditAmount ?? 0) > 0`.

### F19 — Journal-Entry DELETE: `tenant` nicht im `where` des `.update`
- Priorität: **[Standard]**
- Datei: [src/app/api/journal-entries/[id]/route.ts:223-226](src/app/api/journal-entries/[id]/route.ts#L223)
- Bug: `prisma.journalEntry.update({ where: { id }, data: { deletedAt } })` — kein TOCTOU-Schutz. Kommentar in PUT (Z. 165-167) erklärt genau warum, DELETE hat's aber nicht.
- Fix: `where: { id, tenantId: check.tenantId! }`.

### F20 — Skonto `isSkontoValid` mischt Lokal- und UTC-Zeit
- Priorität: **[Standard]**
- Datei: [src/lib/invoices/skonto.ts:73-82](src/lib/invoices/skonto.ts#L73)
- Bug: `deadlineEndOfDay.setHours(23,59,59,999)` = Lokale Zeit (Container = Berlin), Compare gegen `new Date()`. In DST-Übergang oder wenn Container-TZ vom User-Wohnort abweicht: Off-by-1-Tag beim Skonto-Grenzfall.
- Fix: TZ-normalisierter Vergleich (z. B. `date-fns-tz` mit Europe/Berlin).

## Positiv-Feedback (die Domäne ist überwiegend solide gebaut)

- **Invoice-POST** — Nummerngenerierung in derselben `$transaction` wie `invoice.create` = GoBD-lückenlos korrekt ([route.ts:201-256](src/app/api/invoices/route.ts#L201)).
- **Invoice-PATCH** — `updateWithAudit` mit `oldValues/newValues` — GoBD §147 sauber.
- **Journal-Entry PUT/POST/POST** — `Decimal`-Balance-Check mit 0.005-Toleranz (nur im PUT/Post, POST muss nachziehen).
- **Mark-Paid** — `recordPayment` + `createUStAdjustment` + `getTenantSettings.kleinunternehmer` in EINER Transaktion — §17 UStG korrekt.
- **Kassenbuch Daily-Close** — TZ-Bug bewusst adressiert (Kommentar Z. 47-55), UNIQUE-Constraint via P2002 abgefangen.
- **Ledger-Account DELETE** — GoBD-Löschschutz (`usageCount` > 0 → 409).
- **Period-Locks** — konsistent in Journal-POST/PUT/DELETE/post + Mark-Paid + Write-Off. Fehlt nur in Cancel + Asset-Disposal.
- **4-Augen-Prinzip** — beide kritische Aktionen (Journal-Post + SEPA-Approve) via `assertFourEyes` + `findOrCreateApprovalRequest` sauber.
- **Write-Off** — `writeOffReceivable` als Service-Layer mit typisierten Errors (`InvoiceNotWriteOffableError`, `PeriodLockedError`) — vorbildlich.

## Priorisierung für Fix-Sprint

1. F3, F5, F7 (Geld sichtbar falsch für Benutzer)
2. F2 (Bank-Import — vom User als Verdacht gemeldet)
3. F1, F6, F8, F9 (Rundungs/Balance-Bugs)
4. F4 (Skonto-Wipe — häufiger UI-Pfad)
5. F10, F15 (Compliance-Lücken bei Cancel/Disposal)
6. Rest opportunistisch

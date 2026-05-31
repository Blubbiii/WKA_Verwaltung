# HGB/GoBD-Compliance — Umsetzungsplan Phasen 9-19

> **Status:** Geplant · **Effort:** 39 PT (4-6 Wochen Vollzeit) · **Erstellt:** 2026-06-01
> **Basis:** Konsolidierte Findings aus zwei Audits (HGB-Buchhalter-Controller + Debitoren-/Kreditorenbuchhaltung-HGB)
> **Voraussetzung:** Phasen 1-8 sind abgeschlossen und gepusht (Multi-Tenancy, Atomic Numbering, Settlement-Workflow, §14 Outgoing, SCADA N+1, apiError-Pattern).

---

## Executive Summary

Die zwei Audits haben **21 Findings** in den WPM-Buchhaltungsmodulen identifiziert (8 CRITICAL, 5 HIGH, 5 MEDIUM, 3 LOW). Sie betreffen ausnahmslos Kern-HGB/GoBD-Compliance — nicht „Nice-to-haves", sondern Voraussetzungen für einen abgabefähigen Jahresabschluss und für rechtssichere UStVA-Übermittlung.

**11 Phasen P9-P19**, gruppiert nach Domäne und Risiko. **Kritischer Pfad: P9 → P10 → P11 → P15 → P17 → P19 = 22 PT**. Drei klare Stop/Re-Prio-Punkte:

| Nach | Erreicht | Effort kumuliert |
|------|----------|------------------|
| **P11** | GoBD-Mindeststand (Periodensperre + saubere USt) — produktiv-blockierende Findings weg | 14 PT |
| **P15** | HGB-Mindeststand (echte Bilanz, Saldenvortrag, Konsolidierung) — Jahresabschluss-fähig | 25 PT |
| **P19** | Voll-Compliance (GewSt §8, Bank-Match, GoBD Z3-Export) — betriebsprüfungsfest | 39 PT |

**Höchstrisiko-Phasen:** P11 (USt-Split — falsche Splits zerstören GuV) und P15 (Bilanz muss zu 0 ausgleichen). Beide brauchen Shadow-Mode + Goldmaster-Tests bevor sie produktiv geschaltet werden.

**Neue NPM-Packages:** `ibantools` (IBAN-Mod-97), `archiver` (GoBD-Z3-ZIP). Alle anderen Funktionen über bestehende Libs.

---

## Findings-Übersicht (21 Findings → 11 Phasen)

| Finding | Severity | Phase | Quell-Audit |
|---------|----------|-------|-------------|
| F-1 Storno für POSTED-Journals | C | **P9** | HGB-Buchhalter |
| F-2 UStVA strukturell unvollständig | C | **P10+P12** | HGB-Buchhalter |
| F-3 Bilanz/Saldenvortrag fehlen | C | **P15** | HGB-Buchhalter |
| F-4 Periodensperre fehlt | C | **P9** | HGB-Buchhalter |
| F-5 GewSt-Hinzurechnung §8 GewStG | C | **P17** | HGB-Buchhalter |
| F-6 SKR04 String-Range → Metadaten | H | **P15** | HGB-Buchhalter |
| F-7 AfA nicht §7 EStG-konform | H | **P14** | HGB-Buchhalter |
| F-8 Auto-Posting USt-Split fehlt | M | **P11** | HGB-Buchhalter |
| F-9 Fund-Konsolidierung fehlt | M | **P15** | HGB-Buchhalter |
| F-10 GoBD Z3 IDEA-Export | L | **P19** | HGB-Buchhalter |
| D1 Teilzahlungen nicht protokolliert | H | **P16** | Debitoren-Kreditoren |
| D2 §17 USt-Korrektur bei Skonto | M | **P11** | Debitoren-Kreditoren |
| D3 Verzugszinsen §288 BGB | H | **P16** | Debitoren-Kreditoren |
| D4/D5 EWB/PWB + Forderungsausfall | M | **P16** | Debitoren-Kreditoren |
| D6 §14 UStG IncomingInvoice-Validator | C | **P13** | Debitoren-Kreditoren |
| D7 Duplikatsschutz IncomingInvoice | C | **P13** | Debitoren-Kreditoren |
| D8 4-Augen-Freigabe Kreditoren | C | **P13** | Debitoren-Kreditoren |
| D9 SEPA IBAN-Validation + Idempotenz | M | **P18** | Debitoren-Kreditoren |
| D10 Bank-Match Skonto-Toleranz | H | **P18** | Debitoren-Kreditoren |

---

## Architektonische Leitlinien (gelten phasenübergreifend)

1. **Periodensperre als Gate-Layer** (P9): wird in alle schreibenden Journal-Operationen via `assertPeriodOpen(tenantId, bookingDate)` injiziert — **muss zuerst** kommen, alle nachfolgenden Phasen müssen es respektieren.
2. **TaxCode-Domain** (P10) ist Fundament für UStVA, Auto-Posting-Split und §17-Korrektur — vor P8/D2.
3. **Migrationspfad:** Neue NOT-NULL-Felder zuerst nullable einführen → Backfill-Script → ALTER NOT NULL in Folge-Migration.
4. **Shadow-Mode für High-Risk-Refactors** (P11, P15): alte + neue Logik parallel laufen lassen, Diff loggen, 1 Woche Beobachtung, dann switchen.
5. **i18n-Sync:** Jede Phase aktualisiert alle 3 Message-Files (`de.json`, `en.json`, `de-personal.json`) — `npm run i18n:check` als Gate.
6. **Build-Verifikation vor jedem Commit:** `npx tsc --noEmit && npm run lint && npm run build` — alle 3 grün.
7. **Reuse-Pflicht:** `updateWithAudit`, `apiError`, `requirePermission`, `getTenantSettings`, `getNextInvoiceNumberInTx`, `MS_PER_DAY` — keine Duplikat-Helper.

---

## Dependency-Graph

```
                    ┌──────────────────────────┐
                    │ P9: Periodensperre+Storno│ ◄── FOUNDATION
                    └──────────┬───────────────┘
                               │
              ┌────────────────┼─────────────────────┬───────────────┐
              ▼                ▼                     ▼               ▼
       ┌──────────┐    ┌──────────────┐      ┌─────────────┐   ┌─────────┐
       │P10:TaxCd │    │ P13:Kreditor │      │  P14: AfA   │   │ P17: ── │
       └────┬─────┘    │   D6/D7/D8   │      │             │   │ wartet  │
            │          └──────────────┘      └─────────────┘   │ auf P15 │
            ▼                                                   └─────────┘
       ┌──────────────────────┐
       │ P11: USt-Split +§17  │ ◄── HOCHRISIKO
       └──────────┬───────────┘
                  │
      ┌───────────┼────────────┬──────────────┐
      ▼           ▼            ▼              ▼
   ┌────────┐ ┌──────────────────┐ ┌─────────────┐ ┌──────────┐
   │P12:USt │ │ P15: Bilanz/EB   │ │ P16: Forder │ │ P18: SEPA│
   │   VA   │ │  ◄── GRÖSSTE     │ │  D1/D3/D4   │ │  D9/D10  │
   └────────┘ └────────┬─────────┘ └─────────────┘ └──────────┘
                       ▼
                  ┌─────────┐
                  │P17:GewSt│
                  └─────────┘
                       │
                       ▼
                  ┌──────────┐
                  │ P19: Z3  │ ◄── FINAL
                  └──────────┘
```

**Parallelisierbar:** {P10}, {P13}, {P14} können nach P9 parallel laufen. {P12, P16, P18} können nach P11 parallel laufen.

---

# Phasen-Details

## Phase 9 — Periodensperre & Storno-Vervollständigung (Foundation)

**Findings:** F-4, F-1 · **Effort:** 4 PT · **Dependencies:** keine

### Goal
GoBD §146 AO Verstoß beheben: keine Buchungen in geschlossenen Perioden. Manuelle POSTED-Journale können nur via Generalumkehr storniert werden (analog Auto-Posting).

### Prisma Schema-Änderungen
```prisma
model AccountingPeriodLock {
  id           String   @id @default(cuid())
  tenantId     String
  periodYear   Int
  periodMonth  Int
  lockedAt     DateTime @default(now())
  lockedById   String
  unlockedAt   DateTime?
  unlockedById String?
  reason       String?

  tenant       Tenant @relation(fields: [tenantId], references: [id])
  lockedBy     User   @relation("PeriodLocker", fields: [lockedById], references: [id])
  unlockedBy   User?  @relation("PeriodUnlocker", fields: [unlockedById], references: [id])

  @@unique([tenantId, periodYear, periodMonth])
  @@index([tenantId, periodYear, periodMonth])
}

model JournalEntry {
  // ... existing fields
  reversesJournalEntryId       String?  @unique
  reversedByJournalEntryId     String?  @unique
  reversalReason               String?
  reverses                     JournalEntry? @relation("JournalReversal", fields: [reversesJournalEntryId], references: [id])
  reversedBy                   JournalEntry? @relation("JournalReversal")
}
```

**Migration:** `prisma db push` reicht. Neue Tabelle, nullable Felder, kein Backfill.

### Neue API-Routes
| Route | Method | Permission | Body |
|-------|--------|------------|------|
| `/api/accounting/periods/lock` | POST | `accounting:admin` | `{year, month, reason?}` — idempotent via UNIQUE |
| `/api/accounting/periods/lock/[id]` | DELETE | `accounting:admin` | (Audit-pflichtig) |
| `/api/accounting/journals/[id]/reverse` | POST | `accounting:journal:update` | `{reason}` → erzeugt Spiegelbuchung, postet sofort |

### Neue Lib
**`src/lib/accounting/period-lock.ts`**
```typescript
export async function assertPeriodOpen(
  tenantId: string,
  bookingDate: Date,
): Promise<void>  // throws apiError("PERIOD_LOCKED", 409, { details: { year, month } })

export async function reverseJournalEntry(
  tx: TxClient,
  journalEntryId: string,
  userId: string,
  reason: string,
): Promise<JournalEntry>  // Kopiert Lines mit getauschten soll/haben, neue Belegnummer
```

### Refactor Bestehender Files
- `src/lib/accounting/auto-posting.ts` — `assertPeriodOpen()` vor jedem `prisma.journalEntry.create`
- Alle `POST /api/accounting/journals` Routes
- Alle Invoice→Posting, IncomingInvoice→Posting Pfade
- Routes die `journalEntry.update` mit Status POSTED→DRAFT erlauben: **entfernen**, durch Reverse ersetzen

### Tests
- **Vitest:** `period-lock.test.ts` (Gate wirft/wirft-nicht), Storno-Math (soll+haben Summe = 0 nach Storno)
- **Playwright:** Buchung in gesperrtem Monat → 409, Storno einer POSTED-Buchung erzeugt neue POSTED-Spiegelbuchung
- **Manuell:** Admin schließt 2024-12, versucht JournalEntry für 2024-11 → muss scheitern

### Risiken
Bestehende DRAFT→POSTED-Logik darf nicht brechen. **Backfill-Strategie:** Alle Altperioden initial OPEN, Admin schließt manuell historische Perioden.

---

## Phase 10 — TaxCode-Domain-Modell

**Findings:** F-2 (Teil 1: Datenmodell) · **Effort:** 3 PT · **Dependencies:** P9

### Goal
`TaxType` Enum (`STANDARD | REDUCED | EXEMPT`) ersetzen durch echtes Steuerschlüssel-Konzept mit UStVA-Kennziffer-Mapping. Fundament für P11 (USt-Split), P12 (UStVA-Reporting), P18 (Bank-Match §17).

### Prisma Schema-Änderungen
```prisma
enum TaxCategory {
  STANDARD_19
  REDUCED_7
  EXEMPT
  REVERSE_CHARGE_13B        // §13b UStG (Bauleistung, EU-Dienstleistung)
  IGE_INTRA_EU              // Innergemeinschaftlicher Erwerb
  IGL_INTRA_EU              // Innergemeinschaftliche Lieferung
  KLEINUNTERNEHMER_19       // §19 UStG
  NOT_TAXABLE               // außerhalb USt-Bereich
  EXPORT                    // Drittland
}

model TaxCode {
  id            String      @id @default(cuid())
  tenantId      String
  code          String      // DATEV-Steuerschlüssel z.B. "9", "19"
  name          String      // Human-readable
  category      TaxCategory
  rate          Decimal     @db.Decimal(5, 3)  // 0.190 oder 0.000
  vatReportBox  String?     // UStVA-Kennzahl z.B. "81", "41", "46"
  reverseCharge Boolean     @default(false)
  active        Boolean     @default(true)
  taxAccountId  String?     // Verweis auf 1776/1777 (SKR04)

  taxAccount    LedgerAccount? @relation(fields: [taxAccountId], references: [id])

  @@unique([tenantId, code])
  @@index([tenantId, active])
}

model Invoice {
  // ... existing
  taxCodeId String?
  taxCode   TaxCode? @relation(fields: [taxCodeId], references: [id])
}
model IncomingInvoice {
  taxCodeId String?
  taxCode   TaxCode? @relation(fields: [taxCodeId], references: [id])
}
model JournalEntryLine {
  taxCodeId      String?
  taxCode        TaxCode? @relation(fields: [taxCodeId], references: [id])
  ustvaKennzahl  String?  // Direkt-Tag für Reporting (überschreibt TaxCode.vatReportBox falls gesetzt)
}
model LedgerAccount {
  taxKey String?  // DATEV-Steuerschlüssel-Default für Auto-Posting
}
model TenantSettings {
  // ... existing
  kleinunternehmer Boolean @default(false)
}
```

**Migration:** Enum-Erweiterung + neue Tabelle = `prisma db push`. **Backfill-Script** `scripts/seed-default-tax-codes.ts`: pro Tenant 8 Default-TaxCodes (STANDARD_19 → Code "9", REDUCED_7 → "8", etc.). Bestehende Invoices behalten alten `taxType`, neue Aufrufe schreiben `taxCodeId`.

### Neue API-Routes
| Route | Method | Permission |
|-------|--------|------------|
| `/api/accounting/tax-codes` | GET, POST | `accounting:settings:read` / `:write` |
| `/api/accounting/tax-codes/[id]` | PATCH, DELETE | `accounting:settings:write` |
| `/api/accounting/ledger-accounts/[id]/tax` | PUT | `accounting:settings:write` |

### Neue Lib
**`src/lib/accounting/tax-codes.ts`** — `getDefaultTaxCode(tenantId, category)`, `assertTaxCodeBelongsToTenant(tx, taxCodeId, tenantId)`

### Tests
- Snapshot-Test: bestehender Tenant nach Migration hat alle 8 TaxCodes
- 100% Backwards-Compat-Test: alte Invoices mit `taxType=STANDARD` und ohne `taxCodeId` lesbar

### Risiken
**Niedrig** — additiv, keine Breaking Changes. Bestehende TaxType-Felder bleiben parallel bis Phase P11/P12 sie ablöst.

---

## Phase 11 — USt-Split im Auto-Posting + §17-Korrektur (HOCHRISIKO)

**Findings:** F-8, D2 · **Effort:** 4 PT · **Dependencies:** P10

### Goal
Erlöskonten bekommen **Netto**, USt geht auf 1776/1777 (SKR04). Skonto/Gutschrift/Forderungsausfall erzeugen §17 UStG-Korrekturbuchung. Reverse-Charge erzeugt Doppel-Buchung (Vorsteuer 1577 + USt 3837 parallel).

### Prisma Schema-Änderungen
```prisma
model UStAdjustment {
  id                       String           @id @default(cuid())
  tenantId                 String
  originalInvoiceId        String?
  originalIncomingInvoiceId String?
  reason                   String           // SKONTO | CREDIT_NOTE | WRITE_OFF | PARTIAL_PAYMENT
  adjustmentDate           DateTime
  netAmountDelta           Decimal          @db.Decimal(15, 2)
  taxAmountDelta           Decimal          @db.Decimal(15, 2)
  journalEntryId           String           @unique
  createdById              String
  createdAt                DateTime         @default(now())

  originalInvoice          Invoice?         @relation(fields: [originalInvoiceId], references: [id])
  originalIncomingInvoice  IncomingInvoice? @relation(fields: [originalIncomingInvoiceId], references: [id])
  journalEntry             JournalEntry     @relation(fields: [journalEntryId], references: [id])

  @@index([tenantId, adjustmentDate])
}
```

### Neue API-Routes
- `POST /api/accounting/ust-adjustments` body `{invoiceId | incomingInvoiceId, reason, newNetAmount}` → erzeugt Korrektur-Buchung + UStAdjustment-Row

### Neue Lib
**`src/lib/accounting/tax-split.ts`**
```typescript
export function splitGrossAmount(
  gross: Decimal,
  taxCode: TaxCode,
): { net: Decimal; tax: Decimal; taxAccountId: string | null }
// Bei REVERSE_CHARGE_13B → tax=0, separater Eintrag für Vorsteuer+USt
// Bei KLEINUNTERNEHMER → tax=0
```

**`src/lib/accounting/ust-adjustment.ts`** — `createUStAdjustment(tx, params)`
**`src/lib/accounting/kleinunternehmer.ts`** — `assertNotKleinunternehmer(tenantId)` Gate für USt-Operationen

### Refactor Bestehender Files
- `src/lib/accounting/auto-posting.ts` — `postIncomingInvoice()` / `postOutgoingInvoice()` erzeugen **3 Lines statt 2** (Aufwand/Ertrag + USt-Konto + Bank/Debitor). Bei Reverse-Charge: 4 Lines.
- `src/app/api/invoices/[id]/mark-paid/route.ts` — bei `skontoPaid=true` ruft `createUStAdjustment(tx, { reason: 'SKONTO', ... })`

### Tests
- **Vitest Goldmaster:** `tax-split.test.ts` mit 8 TaxType-Varianten × 5 Beispielbeträge, Rundungstoleranz ±0,01 €
- **Snapshot-Test:** UStVA-Output mit Reverse-Charge-Beleg (Kennzahl 46 + 47 müssen passen)
- **Parallel-Run-Modus:** 1 Woche Shadow-Mode — alte + neue Engine berechnen beide, Differenzen loggen, kein Switch wenn >0 €

### Risiken
**HOCH** — falsche USt-Splits zerstören GuV und produzieren falsche UStVA. Pflicht: Goldmaster-Tests + Shadow-Mode + Feature-Flag `tenantSettings.useTaxSplit` für sanften Rollout pro Tenant.

---

## Phase 12 — UStVA-Reporting strukturell vervollständigen

**Findings:** F-2 (Teil 2: Reporting) · **Effort:** 3 PT · **Dependencies:** P11

### Goal
UStVA-Formular mit **allen** Kennzahlen 41/43/46/47/48/60/68/81/84/85/89/93 (IGE, IGL, §13b, §19, sonstige Erlöse/Vorsteuer). ZM-Report-Datenbasis vollständig.

### Refactor (keine neuen Models)
- `src/lib/accounting/reports/ustva.ts` — Aggregation per `JournalEntryLine.ustvaKennzahl` ODER `taxCode.vatReportBox` statt String-Matching auf Kontonummer
- Fallback: alte Konto-Range-Aggregation für Alt-Daten ohne TaxCode

### API
- `GET /api/accounting/reports/ustva?year=YYYY&month=MM` — erweitertes Response-Schema mit allen Kennzahlen, inkl. `kleinunternehmer: boolean` Flag
- ELSTER-Export-Adapter bleibt unverändert (separater Adapter in `src/lib/accounting/elster-export.ts`)

### Komponente
- `src/components/accounting/invoice-form.tsx` blendet USt-Felder aus wenn `tenantSettings.kleinunternehmer=true`

### Tests
- **Vitest:** 10 Mustertransaktionen pro Kennzahl
- **Manuell:** Buchhalter vergleicht WPM-UStVA gegen 2 echte UStVA-Quartale (User stellt zur Verfügung)

### Risiken
ELSTER-Export-Format muss unverändert bleiben. Kennzahlen-Feld auf alten Lines = null, Report muss beides können.

---

## Phase 13 — Kreditoren-Härtung (D6/D7/D8)

**Findings:** D6, D7, D8 · **Effort:** 4 PT · **Dependencies:** keine harten (parallel zu P10-P12 möglich)

### Goal
Doppelzahlungs-Top-1-Quelle eliminieren. Vorsteuerabzug §15 UStG durch §14-Validator für eingehende Rechnungen absichern. 4-Augen-Freigabe mit Schwellenbetrag.

### Prisma Schema-Änderungen
```prisma
model IncomingInvoice {
  // ... existing
  supplierInvoiceNumber String?
  supplierTaxId         String?
  approvedById          String?
  approvedAt            DateTime?
  // KEIN @@unique in Prisma — PARTIAL INDEX via raw SQL (siehe unten)
}

model TenantSettings {
  // ... existing
  fourEyesThresholdEur Decimal? @db.Decimal(15, 2) @default(1000)
}
```

**Raw-SQL-Migration** (`prisma/migrations/manual/incoming_invoice_unique_partial.sql`):
```sql
-- Partial Unique-Index: nur wenn supplierInvoiceNumber gesetzt
CREATE UNIQUE INDEX CONCURRENTLY "ix_incoming_invoice_supplier_unique"
  ON "IncomingInvoice"("tenantId", "supplierContactId", "supplierInvoiceNumber")
  WHERE "supplierInvoiceNumber" IS NOT NULL AND "deletedAt" IS NULL;
```

**WICHTIG vor Deployment:** Duplikat-Cleanup-Script — `SELECT count(*), supplierContactId, supplierInvoiceNumber FROM "IncomingInvoice" GROUP BY ... HAVING count > 1` ausführen, Dubletten **manuell mit User durchgehen + mergen**, sonst bricht die Index-Erstellung.

### Neue API-Routes
| Route | Method | Permission | Notes |
|-------|--------|------------|-------|
| `/api/incoming-invoices` (POST) | bestehend, erweitert | `inbox:create` | Duplikat-Check vor insert |
| `/api/incoming-invoices/[id]/approve` | POST | `accounting:invoice:approve` | MUSS `approvedById ≠ createdById` |
| `/api/incoming-invoices/[id]/pay` | bestehend, erweitert | `inbox:pay` | prüft `approvedAt != null` UND `paidAt IS NULL` (Idempotenz) |

### Neue Lib
**`src/lib/accounting/invoice-validator.ts`** — `validateGermanInvoice(inv): ValidationResult` (§14 UStG Pflichtfelder für Vorsteuerabzug). Wird sowohl für Outgoing (bestehend) als auch Incoming verwendet (refactor: aus `assert-sendable.ts` rausziehen).

### Refactor
- `src/lib/accounting/auto-posting.ts` — `postIncomingInvoice()` prüft `approvedAt != null` für Status ≥ APPROVED

### Tests
- **Vitest:** 4-Augen-Bypass-Test (createdById === approvedById → 403); Race-Condition-Test auf pay-Endpoint (2 parallele Aufrufe → nur 1 PAID)
- **Vitest:** §14-Validator-Tests (analog zum bestehenden assert-sendable.test.ts)
- **Manuell:** Buchhalter lädt absichtlich Duplikat hoch → muss abgewiesen werden

### Risiken
**Bestehende Duplikate** in Produktiv-Daten brechen die Migration. Pflicht: manueller Review-Step mit User VOR Schema-Change.

---

## Phase 14 — AfA & GWG korrekt (§7 EStG)

**Findings:** F-7 · **Effort:** 3 PT · **Dependencies:** P9 (Storno für falsch gerechnete Alt-AfA)

### Goal
Monatsgenaue AfA pro-rata-temporis (§7 Abs. 1 S. 4 EStG). Degressive AfA seit 2023 unzulässig → UI-Warning + Default LINEAR. GWG-Sammelposten §6 EStG (250/800/1000 €-Schwellen).

### Prisma Schema-Änderungen
```prisma
enum AfaMethod {
  LINEAR
  GWG_SOFORT       // < 800 € Netto (§6 Abs. 2 EStG)
  GWG_POOL         // 250-1000 € Netto Sammelposten 5 Jahre (§6 Abs. 2a)
  DEGRESSIVE       // @deprecated — nur historisch, UI warnt
}

model FixedAsset {
  // ... existing
  afaMethod        AfaMethod @default(LINEAR)
  gwgPoolYear      Int?       // Sammelposten-Jahrgang
}

model FixedAssetDepreciation {
  // ... existing
  bookValueBefore  Decimal   @db.Decimal(15, 2)
  bookValueAfter   Decimal   @db.Decimal(15, 2)
}
```

### Neue/Refactored Lib
**`src/lib/accounting/depreciation.ts`** (refactor)
```typescript
export function calculateMonthlyAfa(
  asset: FixedAsset,
  year: number,
  month: number,
): { amount: Decimal; bookValueBefore: Decimal; bookValueAfter: Decimal }
// Pro-rata: Anschaffungsmonat zählt voll, Abgangsmonat zählt nicht
// LINEAR: amount = Anschaffungskosten / Nutzungsdauer / 12
// GWG_SOFORT: vollständig im Anschaffungsmonat, dann 0
// GWG_POOL: 20% pro Jahr, Pool-aggregiert
```

### API
- `POST /api/fixed-assets/[id]/depreciation/run-monthly` (perm `accounting:depreciation:run`)
- BullMQ-Repeatable-Job `depreciation-monthly` (siehe P19/Cross-Cutting)

### Tests
- **Vitest:** 12 monatliche AfA-Buchungen summieren = Jahres-AfA; GWG-Schwellen-Test; Anschaffungsmonat-Edge-Case
- **Manuell:** Buchhalter vergleicht WPM-AfA-Tabelle gegen DATEV-Referenzdaten für 20 Assets

### Risiken
Bestehende Asset-Bestände müssen neu gerechnet werden → Reconciliation-Report mit Differenz pro Asset. Bei Differenz > Toleranz: manuelle Storno via P9 + Neubuchung.

---

## Phase 15 — Bilanz, Saldenvortrag, Konsolidierung (GRÖSSTE PHASE)

**Findings:** F-3, F-6, F-9 · **Effort:** 6 PT · **Dependencies:** P9 (Period-Close), P11 (saubere USt-Splits)

### Goal
Vollständiger Jahresabschluss möglich: Bilanz (Aktiva/Passiva), Eröffnungsbilanz, Saldenvortrag (Jahreswechsel-Job), Konsolidierung über Fund-Hierarchy. SKR04-Mandantenfähigkeit (String-Range-Hack ersetzen).

### Prisma Schema-Änderungen
```prisma
enum BalanceSheetSection {
  ASSET_FIXED         // Anlagevermögen
  ASSET_CURRENT       // Umlaufvermögen
  ASSET_DEFERRED      // Rechnungsabgrenzung Aktiva
  EQUITY              // Eigenkapital
  PROVISION           // Rückstellungen
  LIABILITY_LONG      // Verbindlichkeiten > 1 Jahr
  LIABILITY_SHORT     // Verbindlichkeiten < 1 Jahr
  LIABILITY_DEFERRED  // Rechnungsabgrenzung Passiva
}

model LedgerAccount {
  // ... existing
  balanceSheetSection BalanceSheetSection?
  category            String?  // Single-Source-of-Truth für GuV/BWA — z.B. "REVENUE_OPERATING", "EXPENSE_INTEREST"
  gewStAddBackKey     String?  // P17 nutzt das
}

model OpeningBalance {
  id              String @id @default(cuid())
  tenantId        String
  fiscalYear      Int
  ledgerAccountId String
  debitAmount     Decimal @db.Decimal(15, 2) @default(0)
  creditAmount    Decimal @db.Decimal(15, 2) @default(0)
  createdById     String
  createdAt       DateTime @default(now())

  ledgerAccount   LedgerAccount @relation(fields: [ledgerAccountId], references: [id])

  @@unique([tenantId, fiscalYear, ledgerAccountId])
  @@index([tenantId, fiscalYear])
}

model BalanceSheetSnapshot {
  id          String   @id @default(cuid())
  tenantId    String
  fiscalYear  Int
  asOf        DateTime
  generatedAt DateTime @default(now())
  snapshot    Json     // {aktiva: [...], passiva: [...], summary: {...}}
  fundId      String?  // null = Tenant-weit; gesetzt = Fund-spezifisch

  @@index([tenantId, fiscalYear, fundId])
}
```

**Backfill** (`scripts/backfill-balancesheet-section.ts`): mappt SKR04-Standardranges (0xxx → ASSET_FIXED, 1xxx → ASSET_CURRENT etc.) auf alle bestehenden LedgerAccounts. Unmapped = bleibt null, Bilanz-Report meldet "unmapped accounts" als Warnung.

### Neue API-Routes
| Route | Method | Permission |
|-------|--------|------------|
| `/api/accounting/reports/bilanz` | GET | `accounting:report:read` (Query: `asOf`, `fundId?`, `consolidate?`) |
| `/api/accounting/year-end-close` | POST | `accounting:admin` (Body: `{fromYear, toYear}` — orchestriert Bilanz-Snapshot → Saldenvortrag → Period HARD_CLOSED) |
| `/api/accounting/funds/[id]/consolidated-bilanz` | GET | `accounting:report:read` |

### Neue Lib
**`src/lib/accounting/reports/bilanz.ts`** — `computeBilanz(tenantId, asOf, fundId?): BilanzResult`
**`src/lib/accounting/year-end-close.ts`** — `carryForward(tx, tenantId, fromYear, toYear)` erzeugt OpeningBalance-Rows + 1 JournalEntry "Saldenvortrag" auf Konto 9000
**`src/lib/accounting/consolidation.ts`** — `consolidateFunds(rootFundId, asOf)` aggregiert über FundHierarchy + eliminiert Inter-Fund-Buchungen

### Refactor
**Alle Reports** (`bwa.ts`, `guv.ts`, `susa.ts`, `euer.ts`) — Konto-Klassifikation via `category`-Feld, **Range-Hardcode entfernen**.
**Strategie:** Shadow-Mode — alte Range-Logik + neue category-Logik parallel, Diff loggen, 1 Woche Beobachtung, dann switchen.

### Tests
- **Vitest:** Bilanz summiert auf 0 bei Test-Buchungen; Carry-Forward erzeugt korrekte Saldenvorträge; Konsolidierung eliminiert Inter-Fund-Buchung beidseitig
- **End-to-End mit Test-Mandant** über volles Jahr (12 Monate buchen → Close → Saldenvortrag → neue Periode)
- **Manuell:** Buchhalter prüft Probebilanz gegen DATEV-Export

### Risiken
**SEHR HOCH** — Bilanz muss zu 0 ausgleichen. Pflicht: Differenzkonto-Mechanismus + Admin-Alarm bei Inkonsistenz (z.B. > 0,02 € Differenz). BWA/GuV-Werte könnten sich durch Refactor ändern wenn Backfill ungenau — Shadow-Mode ist Pflicht.

---

## Phase 16 — Forderungsmanagement (Teilzahlung, Verzug, EWB)

**Findings:** D1, D3, D4/D5 · **Effort:** 5 PT · **Dependencies:** P9, P11 (für §17-Buchungen)

### Goal
Teilzahlungen protokollieren mit InvoicePayment-Tabelle. Verzugszinsen §288 BGB berechnen (B2B 9%+40€, B2C 5%). EWB/PWB §253 HGB als manueller Workflow. WRITTEN_OFF-Status mit §17 UStG-Korrektur.

### Prisma Schema-Änderungen
```prisma
model InvoicePayment {
  id                String   @id @default(cuid())
  tenantId          String
  invoiceId         String
  paymentDate       DateTime
  amount            Decimal  @db.Decimal(15, 2)
  paymentMethod     String   // BANK | CASH | SEPA | OTHER
  bankTransactionId String?
  journalEntryId    String?
  createdById       String
  createdAt         DateTime @default(now())

  invoice           Invoice           @relation(fields: [invoiceId], references: [id])
  bankTransaction   BankTransaction?  @relation(fields: [bankTransactionId], references: [id])
  journalEntry      JournalEntry?     @relation(fields: [journalEntryId], references: [id])

  @@index([tenantId, invoiceId])
}

model BaseInterestRate {
  // Mandantenunabhängig — Bundesbank-Sätze global gepflegt
  id          String   @id @default(cuid())
  validFrom   DateTime
  validTo     DateTime?
  ratePercent Decimal  @db.Decimal(5, 3)  // z.B. -0.880 für 2024
  source      String   // "Bundesbank §247 BGB"

  @@unique([validFrom])
}

model ValueAdjustment {
  // EWB/PWB §253 HGB
  id              String   @id @default(cuid())
  tenantId        String
  invoiceId       String?
  type            ValueAdjustmentType  // EWB | PWB | DIRECT_WRITEOFF
  amountEur       Decimal  @db.Decimal(15, 2)
  reason          String
  postedJournalId String?
  createdById     String
  createdAt       DateTime @default(now())

  invoice         Invoice?     @relation(fields: [invoiceId], references: [id])
  postedJournal   JournalEntry? @relation(fields: [postedJournalId], references: [id])
}

enum ValueAdjustmentType {
  EWB              // Einzelwertberichtigung
  PWB              // Pauschalwertberichtigung
  DIRECT_WRITEOFF  // Direkte Ausbuchung
}

enum InvoiceStatus {
  // ... existing DRAFT, SENT, PAID, CANCELLED
  PARTIALLY_PAID
  WRITTEN_OFF
}

model Invoice {
  // ... existing
  paidAmount Decimal @db.Decimal(15, 2) @default(0)
}

model DunningItem {
  // ... existing feeAmount
  interestAmount     Decimal @db.Decimal(15, 2) @default(0)
  interestRatePercent Decimal? @db.Decimal(5, 3)
  interestDaysOverdue Int?
  interestLumpSumEur  Decimal @db.Decimal(15, 2) @default(0)  // 40€ B2B-Pauschale
}

model Person {
  // ... existing
  isBusinessCustomer Boolean @default(false)  // B2B/B2C-Flag für §288
}
```

**Migration:** `prisma db push` + Backfill-Script: `UPDATE "Invoice" SET "paidAmount" = "totalAmount" WHERE status='PAID'`. Bundesbank-Seed mit historischen Sätzen seit 2020 (10 Zeilen).

### Neue API-Routes
| Route | Method | Permission |
|-------|--------|------------|
| `/api/invoices/[id]/payments` | POST | `invoice:update` |
| `/api/invoices/[id]/write-off` | POST | `accounting:invoice:writeoff` (Body: `{reason, type: 'EWB'\|'PWB'\|'DIRECT'}`) |
| `/api/accounting/invoices/overdue?withInterest=true` | GET | `accounting:report:read` |
| `/api/accounting/value-adjustments` | GET, POST | `accounting:report:read` / `:write` |
| `/api/accounting/base-interest-rates` | GET, POST | `accounting:admin` |

### Neue Lib
**`src/lib/accounting/invoice-payment.ts`** — `recordPayment(tx, invoiceId, amount, date)` (transaction-safe, recomputes Invoice.paidAmount/status)
**`src/lib/accounting/write-off.ts`** — `writeOffReceivable(tx, invoiceId, reason, type)` (erzeugt JournalEntry gegen 1240/1248 + §17 USt-Korrektur via P11-Helper)
**`src/lib/accounting/interest.ts`** — `computeDefaultInterest({principal, dueDate, paymentDate, isB2B}): {interestAmount, ratePercent, days, lumpSumEur}`
**`src/lib/external/bundesbank.ts`** — `fetchBaseRate()` (manuell triggerbar, kein Cron-Zwang)

### Refactor
- `src/lib/accounting/dunning.ts` — berechnet `openAmount = totalAmount - paidAmount` statt boolean isPaid; Zinsen pro DunningItem
- `src/components/invoices/invoice-detail.tsx` — Payments-Liste sichtbar

### Tests
- **Vitest:** 3 Teilzahlungen summieren = Rechnungsbetrag → status PAID; Write-off + nachträglicher Zahlungseingang → Sonderertrag-Buchung
- **Vitest:** Verzugszinsen mit Stichdaten aus IHK-Merkblatt (B2B 9% + 40€ Pauschale, B2C 5%)
- **Manuell:** User-Review der Regelmatrix vor Implementation

### Risiken
Verzugszinsen-Logik hat viele Edge-Cases (Feiertage, Mahnverzicht, Verbraucher-Klassifikation). Wenn `isBusinessCustomer` für Bestandskontakte unbekannt → Default `false` (B2C, niedrigere Zinsen — konservativ).

---

## Phase 17 — GewSt-Hinzurechnung §8 GewStG

**Findings:** F-5 · **Effort:** 2 PT · **Dependencies:** P15 (saubere GuV)

### Goal
Gewerbesteuer-Hinzurechnung §8 Nr 1e GewStG für Pachten/Mieten (5% bzw. 20%, mit 200k€ Freibetrag). Wesentlich für Windpark-KGs mit hohen Pachtaufwänden.

### Prisma (minimal)
`LedgerAccount.gewStAddBackKey` (bereits in P15 angelegt) wird genutzt — z.B. `"MIETE_IMMOBILIEN"` (50%), `"MIETE_BEWEGLICH"` (20%), `"LIZENZGEBUEHR"` (25%).

### Neue API-Routes
- `GET /api/accounting/reports/gewerbesteuer?year=YYYY` → `{gewinn, hinzurechnungen: {miete_immobilien, miete_beweglich, ...}, freibetrag, gewstMessbetrag, gewstZahlung}`

### Neue Lib
**`src/lib/accounting/reports/gewerbesteuer.ts`** — `computeGewSt(tenantId, year): GewStResult`

### Tests
- **Vitest:** Pacht 24k€ → unter Freibetrag → 0 hinzurechnen; Pacht 300k€ → 100k × 1/4 = 25k Hinzurechnung
- **Manuell:** Vergleich gegen Steuerberater-Berechnung für 1 Park

### Risiken
**Niedrig** — reines Reporting, keine Schreiboperationen.

---

## Phase 18 — Bank-Match Skonto-Toleranz + SEPA-Härtung

**Findings:** D9, D10 · **Effort:** 2 PT · **Dependencies:** P11 (§17-Mechanismus)

### Goal
Bank-Match akzeptiert Differenz ≤ 2% ODER ≤ Skonto-Betrag innerhalb Frist → erzeugt §17-Korrektur. IBAN-Mod-97-Validierung vor SEPA-Generierung. SEPA-Idempotenz: derselbe Datensatz nicht zweimal im XML.

### Prisma Schema-Änderungen
```prisma
model BankTransaction {
  // ... existing (matchSource, matchedById, matchedAt aus Phase 4)
  matchedSkontoAmount Decimal? @db.Decimal(15, 2)
  matchVariance       Decimal? @db.Decimal(15, 2)
}

model SepaBatch {
  id           String          @id @default(cuid())
  tenantId     String
  msgId        String          @unique  // WPM-{tenantId}-{timestamp}-{hash}
  createdAt    DateTime        @default(now())
  createdById  String
  xmlContent   String          @db.Text
  totalAmount  Decimal         @db.Decimal(15, 2)
  itemCount    Int
  status       SepaBatchStatus @default(DRAFT)

  items        IncomingInvoice[]
}

model IncomingInvoice {
  // ... existing
  sepaBatchId String?
  sepaBatch   SepaBatch? @relation(fields: [sepaBatchId], references: [id])
}

enum SepaBatchStatus {
  DRAFT
  EXPORTED
  ACKNOWLEDGED
  FAILED
}
```

### Neue API-Routes
| Route | Method | Permission |
|-------|--------|------------|
| `/api/sepa/batches` | POST | `sepa:create` (Body: `{incomingInvoiceIds[]}`) |
| `/api/banking/transactions/[id]/match` (erweitert) | POST | `bank:match` (Body: `{invoiceId, applySkonto: boolean}`) |

### Neue Lib
**`src/lib/iban.ts`** — `validateIban(iban): {valid, country, bic?}` (mod-97 via `ibantools`)
**`src/lib/sepa/builder.ts`** — `buildPain001(batch, items): string` (über `xmlbuilder2`, vorhanden)
**`src/lib/banking/skonto-matcher.ts`** — `computeSkonto(invoice, paymentDate, tenantSettings)`

### Refactor
- `src/lib/banking/auto-match.ts` — fuzzy-match akzeptiert Skonto-Varianten
- `src/app/api/inbox/export/sepa/route.ts` — Filter `sepaExportedAt IS NULL` ergänzen

### Tests
- **Vitest:** 50 IBAN-Testvektoren (gültig/ungültig je Land); SEPA-Idempotenz (2× gleicher Batch → 2. liefert existing batch)
- **Vitest:** Rechnung 1000€, Skonto 2%/10 Tage → bei 980€ Eingang innerhalb 10d → match=true

### Risiken
**Niedrig** — additiv.

---

## Phase 19 — GoBD Z3 IDEA-Export (Datenträgerüberlassung)

**Findings:** F-10 · **Effort:** 3 PT · **Dependencies:** P9-P17

### Goal
GoBD Z3-Datenträgerüberlassung für Betriebsprüfung — IDEA-Format mit `index.xml`, `gdpdu-01-08-2002.dtd`, CSV-Files pro Tabelle.

### Prisma Schema-Änderungen
```prisma
model GobdExport {
  id             String   @id @default(cuid())
  tenantId       String
  periodFrom     DateTime
  periodTo       DateTime
  createdAt      DateTime @default(now())
  createdById    String
  fileHash       String   // SHA-256
  fileSize       Int
  downloadCount  Int      @default(0)
  lastDownloadAt DateTime?

  @@index([tenantId, periodFrom])
}
```

### Neue API-Routes
- `POST /api/accounting/gobd-export` body `{from, to}` → erzeugt ZIP, persistiert GobdExport-Row, returned Download-URL
- `GET /api/accounting/gobd-export/[id]/download` → streamt ZIP, increment downloadCount

### Neue Lib
**`src/lib/accounting/gobd-export.ts`** — `generateZ3Export(tenantId, from, to): {zipBuffer, hash}`
**`src/lib/accounting/idea-xml.ts`** — `buildIndexXml(tables)` + `buildDtd()` (BMF-Spec)

### Libs
`npm i archiver` (~50kB) für ZIP-Stream. `xmlbuilder2` vorhanden.

### Tests
- **Vitest:** Z3-Export enthält index.xml + alle Pflicht-Tabellen
- **Manuell:** Z3-Export in IDEA/ACL testweise importieren (Steuerberater)

### Risiken
Format ist BMF-spezifiziert, externe Validierung via IDEA-Demo nötig.

---

## Cross-Cutting (parallel zu P9-P19)

### BullMQ-Jobs (Phase „K" beim Backend Developer)
Neu zu registrieren:
- `accounting:depreciation-monthly` (Repeatable, 1× pro Monat — siehe P14)
- `accounting:dunning-with-interest` (Repeatable — siehe P16)
- `accounting:bundesbank-rate-refresh` (manuell triggerbar — siehe P16)

### Audit-Trail
Alle 21 neuen Routes nutzen `updateWithAudit` aus `@/lib/audit-update` (bereits in Phase 2 etabliert). Lint-Regel oder Test sicherstellen, dass keine direkten `prisma.X.update()` ohne Audit verwendet werden.

### i18n
Pro Phase neue Keys in `messages/de.json`, `messages/en.json`, `messages/de-personal.json`. Neue Namespaces:
- `accounting.periodLock`, `accounting.taxAdjustment`, `accounting.payments`, `accounting.consolidation`, `accounting.gobdExport`, `accounting.gewerbesteuer`, `accounting.bilanz`
- `iban`, `sepa`
- `dunning.interest`

Sync-Gate: `npm run i18n:check`.

### Build-Verifikation
**Pflicht vor jedem Commit:**
```bash
npx tsc --noEmit && npm run lint && npm run build
```
Alle 3 grün — kein Skip-Hook (`--no-verify` verboten ohne explizite User-Anweisung).

### Neue NPM-Pakete
| Package | Größe | Phase | Zweck |
|---------|-------|-------|-------|
| `ibantools` | ~5 kB | P18 | IBAN-Mod-97 + DE-IBAN-zu-BIC |
| `archiver` | ~50 kB | P19 | ZIP-Stream für GoBD-Z3 |

Alles andere wird wiederverwendet: `xmlbuilder2`, `bullmq`, `ioredis`, `@prisma/client`, `next-auth`.

---

## Effort-Summary

| Phase | Findings | Effort | Kumuliert | Critical Path? |
|-------|----------|--------|-----------|----------------|
| P9 | F-4, F-1 | 4 PT | 4 PT | ✅ |
| P10 | F-2.1 | 3 PT | 7 PT | ✅ |
| P11 | F-8, D2 | 4 PT | 11 PT | ✅ |
| P12 | F-2.2 | 3 PT | 14 PT | — |
| P13 | D6, D7, D8 | 4 PT | 18 PT (parallel) | — |
| P14 | F-7 | 3 PT | 21 PT (parallel) | — |
| P15 | F-3, F-6, F-9 | 6 PT | 25 PT | ✅ |
| P16 | D1, D3, D4, D5 | 5 PT | 30 PT (parallel) | — |
| P17 | F-5 | 2 PT | 32 PT | ✅ |
| P18 | D9, D10 | 2 PT | 34 PT (parallel) | — |
| P19 | F-10 | 3 PT | 39 PT | ✅ |

**Gesamt: 39 PT** (kritischer Pfad 22 PT — bei Parallelisierung 4-5 Wochen)

---

## Stop/Re-Prio-Punkte

### Nach P11 (14 PT)
**Status:** GoBD-Mindeststand erreicht — Periodensperre aktiv, USt-Splits sauber, keine produktiv-blockierenden Findings mehr.
**Pilot-fähig?** Ja, für interne Tests.
**Was fehlt:** Bilanz, Verzugszinsen, Teilzahlungen, GewSt — alles nicht laufzeit-kritisch für einfache Rechnungs-/Zahlungs-Workflows.

### Nach P15 (25 PT)
**Status:** HGB-Mindeststand — echte Bilanz, Saldenvortrag, Konsolidierung verfügbar. Jahresabschluss möglich.
**Pilot-fähig?** Ja, auch für externe Tests mit Steuerberater.
**Was fehlt:** GewSt-Hinzurechnung (relevant nur bei Jahresende), Bank-Match-Komfort, GoBD-Z3 (relevant nur bei Betriebsprüfung).

### Nach P19 (39 PT)
**Status:** Voll-Compliance — betriebsprüfungsfest, abgabefähige UStVA, ELSTER-kompatibel, alle Audits adressiert.

---

## Out-of-Scope (bewusst nicht im Plan)

- **SEPA-Lastschrift** (CORE/B2B, FRST/RCUR/FNAL Sequence) — nur Credit Transfer im Plan. Lastschrift relevant für Pachten/Versicherungen, aber separater Workflow.
- **OSS-Meldung** — WPM verkauft Strom nur an deutsche Netzbetreiber.
- **E-Bilanz §5b EStG XBRL-Übermittlung** — Bilanz wird in P15 generierbar, XBRL-Export-Adapter als spätere Phase.
- **Belegerkennung KI/OCR** — Rechnungs-PDFs werden weiterhin manuell erfasst.

---

## Nächste Schritte

1. **User-Approval** für diesen Plan (insbesondere: Stop-Punkte? Phasenreihenfolge?).
2. Bei Approval: **Detail-Spec für P9** als `docs/requirements/PROJ-WPM-P9-period-lock.md` ausarbeiten (User-Stories, Acceptance Criteria, Edge Cases).
3. P9 implementieren (4 PT), inkl. Tests, dann Build-Verifikation + Commit + Push.
4. Pro Phase: Spec → Implementation → Tests → Commit → User-Review.

**Verantwortlich:** Backend-Entwickler (Solo). Bei Bedarf Frontend-Anpassungen (Forms, Tabellen, Reports) zusätzlich.

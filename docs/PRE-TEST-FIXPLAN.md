# Pre-Test Fix-Plan — Alle Audit-Findings vor Real-Test

**Gesamt-Aufwand: ~28-32h** (verteilt auf 8 Phasen). Jede Phase = eigener Commit als Safety-Net. Nach jeder Phase volle Verifikation (tsc + lint + build + vitest 293/293).

---

## Phase 1 — Tenant-Leak Hotfixes (CRITICAL Security) — ~1.5h

**Ziel:** 7 Cross-Tenant-Daten-Leaks schließen. Quick wins, mostly 1-Zeilen-Fixes.

| Finding | Datei | Fix |
|---------|-------|-----|
| C1 | `src/app/api/batch/settlements/route.ts:28` | `findMany({where: {id: {in: ids}, tenantId: check.tenantId!}})` |
| C2 | `src/lib/scada/aggregation.ts:85` | `where` um `tenantId` ergänzen (Parameter von Caller) |
| C3 | `src/app/api/portal/my-distributions/route.ts:29-51` | 2 Queries (shareholder.findMany + invoice.findMany) tenantId-Filter |
| C4 | `src/app/api/portal/my-participations/route.ts:35` | 1 Query (shareholder.findMany) tenantId-Filter |
| C5 | `src/app/api/portal/my-documents/route.ts:30-72` | 2 Queries (shareholder.findMany + document.findMany) tenantId-Filter |
| C6 | `src/app/api/admin/jobs/route.ts` + `stats/route.ts` | `requireSuperadmin()` ODER filter `job.data.tenantId === check.tenantId` |
| C7 | `src/app/api/metrics/route.ts:11-31` | In Production fail-closed wenn `METRICS_TOKEN` nicht gesetzt |

**Verifikation:** tsc + lint + build + vitest. Stichprobe: 1 Portal-Endpoint mit 2 Tenants kreuzen, prüfen dass 404 statt Leak.

**Commit:** `fix(security): Phase 1 — 7 Multi-Tenancy Tenant-Leak Hotfixes`

---

## Phase 2 — GoBD Foundation (CRITICAL Compliance) — ~7h

**Ziel:** Drei GoBD-Showstopper schließen die bei einer Betriebsprüfung problematisch wären.

### 2.1 Invoice-Number in Insert-Transaction (~2h)

Datei: `src/lib/invoices/numberGenerator.ts`, `src/app/api/invoices/route.ts`

- `numberGenerator.getNextInvoiceNumber()` zu einer Funktion machen die innerhalb einer bereits-laufenden Transaction läuft (Signatur: `(tx, ...args)`)
- POST `/api/invoices` (Zeile 173 + 199) komplett in `prisma.$transaction(async (tx) => { const num = await getNextInvoiceNumber(tx, ...); return tx.invoice.create({...num...}) })` wrappen
- Damit: wenn Insert failt, Nummer wird auch nicht "verbrannt" → keine Lücken
- Idempotenz-Header `Idempotency-Key` als Bonus für Doppel-POST-Schutz

### 2.2 IncomingInvoice Status-Gate + Audit (~2h)

Datei: `src/app/api/inbox/[id]/route.ts`

- PUT-Handler: erlaubte Stati zum Editieren auf `INBOX` und `REVIEW` beschränken (analog DELETE-Logik)
- Alle anderen Stati → 409 Conflict mit Begründung
- JEDE Änderung in `AuditLog` schreiben (oldValues + newValues + userId)

### 2.3 Zentraler `updateWithAudit()`-Helper (~3h)

Neue Datei: `src/lib/audit-update.ts`

```ts
// Pseudo-API
async function updateWithAudit<T>(opts: {
  tx?: Prisma.TransactionClient,
  entityType: string,    // "Invoice" | "InvoiceItem" | "JournalEntry" | "IncomingInvoice"
  entityId: string,
  userId: string,
  tenantId: string,
  mutation: (oldRecord: T) => Promise<T>,
}): Promise<T>
```

Verhalten: Vor-Snapshot lesen, Mutation ausführen, Diff (changed fields) berechnen, AuditLog-Entry erstellen — alles in einer Transaction.

**Retrofit:** Anwenden auf PATCH-Handler von:
- `src/app/api/invoices/[id]/route.ts:243`
- `src/app/api/invoices/[id]/items/[itemId]/route.ts:114`
- `src/app/api/inbox/[id]/route.ts:103`
- `src/app/api/invoices/[id]/cancel/route.ts:60`
- `src/app/api/invoices/[id]/send/route.ts:42`
- (weitere JournalEntry-PATCH-Routes falls vorhanden)

**Verifikation:** Unit-Tests für `updateWithAudit` (Mock-tx, prüft dass oldValues+newValues korrekt). E2E: Invoice editieren → AuditLog-Entry sichtbar.

**Commit:** `fix(gobd): Phase 2 — Invoice-Numbering atomic + IncomingInvoice gate + central updateWithAudit`

---

## Phase 3 — Settlement-Workflow Datenintegrität (CRITICAL) — ~3h

**Ziel:** Idempotenz im Settlement-Flow, damit Crashes keine Duplikate/Doppel-Mails erzeugen.

### 3.1 create-invoices Idempotenz (~1.5h)

Datei: `src/app/api/admin/settlement-periods/[id]/create-invoices/route.ts`

- Vor jeder `prisma.invoice.create()` prüfen: `findFirst({where: {settlementPeriodId, leaseId, invoiceType}})` 
- Wenn vorhanden + Status DRAFT: skippen ("already exists for lease X")
- Wenn vorhanden + Status SENT/PAID: skippen mit Warnung
- Wenn vorhanden + Status CANCELLED: löschen und neu anlegen

### 3.2 send-all-invoices Filter + Approval-Gate (~1.5h)

Datei: `src/app/api/admin/settlement-periods/[id]/send-all-invoices/route.ts`

- Filter ändern: `where: {status: "DRAFT", emailedAt: null}` (nicht `["DRAFT","SENT"]`)
- Vor Send-Schleife: Period-Status prüfen → muss `APPROVED` sein (sonst 409)
- Permission upgraden auf `requireAdmin()` (nicht `invoices:update`)

**Verifikation:** Manueller Test mit künstlich abgebrochenem create-invoices → Retry erzeugt keine Duplikate. Unit-Tests für die Filter-Logik.

**Commit:** `fix(billing): Phase 3 — Settlement create-invoices idempotency + send-all approval-gate`

---

## Phase 4 — Compliance HIGH (~5h)

### 4.1 §14 UStG Pflichtangaben-Validator (~2h)

Neue Datei: `src/lib/invoices/assert-sendable.ts`

```ts
export function assertSendable(invoice: Invoice & {items: InvoiceItem[]}): void {
  // Wirft AssertionError wenn Pflichtangaben fehlen:
  // - recipientName + recipientAddress (mit Strasse, PLZ, Stadt)
  // - invoiceDate, serviceStartDate/EndDate
  // - tenant.taxId oder vatId muss gesetzt sein
  // - mindestens 1 invoiceItem
  // - tax-Aufschlüsselung muss konsistent zur grossAmount sein
}
```

Aufrufen in:
- `src/app/api/invoices/[id]/send/route.ts` vor Status-Wechsel
- `src/app/api/invoices/[id]/email/route.ts`
- batch/invoices.ts (approve + send)

### 4.2 AuditLog DB-Manipulationsschutz (~1.5h)

Migration: `prisma/migrations/manual/audit-log-readonly.sql`

```sql
-- App-User darf nur INSERT + SELECT
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM <app_db_user>;
GRANT INSERT, SELECT ON audit_logs TO <app_db_user>;
-- Optional: Hash-Chain via Trigger
```

Doku in `docs/devops/audit-log-hardening.md`.

### 4.3 Bank-Match Audit-Metadaten (~1h)

Datei: `prisma/schema.prisma` — `BankTransaction` erweitern:
- `matchSource: BankMatchSource @default(SYSTEM)` (Enum: SYSTEM, USER, NONE)
- `matchedById: String?`
- `matchedAt: DateTime?`
- `matchConfidence: Decimal?` (für auto-matches)

`src/lib/bank-import/matcher.ts` + `src/app/api/buchhaltung/bank/transactions/[id]/match/route.ts` anpassen.

### 4.4 Retention Policy erweitern (~30min)

Datei: `src/lib/retention/retention-service.ts`

Ergänzen in `RETENTION_POLICY`:
- `CashBookEntry: 10`
- `BankTransaction: 10`
- `DunningRun: 10`

**Commit:** `feat(compliance): Phase 4 — UStG-Validator + AuditLog-Hardening + Bank-Match-Audit + Retention`

---

## Phase 5 — Settlement-Workflow Decisions + Refactor (~5h)

**⚠️ Diese Phase braucht eine User-Entscheidung BEVOR ich anfange:**

### Entscheidung 1: Doppel-Architektur (H3)
WPM hat zwei parallele Systeme:
- `LeaseSettlementPeriod` (`/api/admin/settlement-periods/*`) — Admin-API, calculator.ts
- `LeaseRevenueSettlement` (`/api/leases/settlement/*`) — eigene API, eigener calculator

**Optionen:**
- **A) Konsolidieren:** Eines der beiden raus, anderes bleibt → Migration der Daten + 30+ Endpoints
- **B) Dokumentieren:** Beide bleiben, klare Doku wann welches genutzt wird → ~1h Doku, langfristig Wartungsaufwand höher
- **C) UI-Audit zuerst:** Welche Pages nutzen welche API? Erst dann entscheiden

→ **Meine Empfehlung:** C zuerst (1h Recherche), dann A wenn klar ist welches System dominant ist.

### Wenn Entscheidung steht:

### 5.1 Submit-for-Review Endpoint (~1h)
Neuer Route: `POST /api/admin/settlement-periods/[id]/submit` — setzt `IN_PROGRESS → PENDING_REVIEW`. Vier-Augen-Logik (Approver ≠ Submitter) ist im approve-Endpoint schon da, wird durch diesen Schritt erst aktivierbar.

### 5.2 APPROVED → CLOSED Transition (~1h)
Neuer Route: `POST /api/admin/settlement-periods/[id]/close` — setzt `APPROVED → CLOSED`. Trigger: alle Invoices der Period sind PAID oder CANCELLED.

### 5.3 Pachtgeber-Wechsel anteilig (~3h)
Datei: `src/lib/settlement/calculator.ts`

- Wenn Lease.startDate > periodStart oder Lease.endDate < periodEnd:
  - Anteil = (overlap_tage / period_tage)
  - paymentPerLease = baseAmount * Anteil
- Edge-Case: zwei aufeinanderfolgende Leases derselben Plot-Area in derselben Period

**Commit:** `refactor(settlement): Phase 5 — Approval-Workflow + Close-Transition + zeit-anteilige Berechnung`

---

## Phase 6 — API Hardening (HIGH) — ~3h

### 6.1 Zod-Validation für 43 Mutation-Routes (~2h)

Files (aus API-Tester Report):
- `src/app/api/notifications/[id]/route.ts` + `mark-all-read/route.ts`
- `src/app/api/consent/route.ts` (DSGVO-relevant!)
- `src/app/api/batch/{settlements,documents,email,invoices}/route.ts`
- `src/app/api/invoices/[id]/mark-paid/route.ts`
- `src/app/api/admin/users/[id]/roles/route.ts`
- Mehrere `management-billing/*/[id]/route.ts` PATCH-Handler

Pro Route: ein Zod-Schema (klein, nur die erwarteten Felder), `safeParse(await req.json())`, bei Fail `apiError("VALIDATION_FAILED", 400, {details: parsed.error.flatten()})`.

### 6.2 IP-Rate-Limit für Webhook/Cron (~1h)

Files:
- `src/app/api/email/inbound/route.ts`
- `src/app/api/cron/check-deadlines/route.ts`
- `src/app/api/auth/sso-config/route.ts`
- `src/app/api/health/route.ts` (Health: niedriges Limit, nur gegen DoS)

Pro Route: `rateLimit(getClientIp(req), { limit: 100, windowMs: 60_000 })` direkt nach Token-Check.

**Commit:** `fix(api): Phase 6 — Zod-Validation auf 43 Routes + Rate-Limit für Webhooks`

---

## Phase 7 — DB-Performance (HIGH + MEDIUM) — ~3h

### 7.1 SCADA N+1 fixen (H11) — ~1h
Datei: `src/lib/scada/import-service.ts:2041-2056`

Die Doppelschleife (Monat × Turbine) → 1 `$queryRaw` mit `GROUP BY turbineId, date_trunc('month', timestamp)`. Analog zu der Aggregation die in `module-fetchers.ts:164-178` schon richtig gemacht ist.

### 7.2 Redundante Hypertable-Indexes entfernen (M2) — ~30min
Migration: `prisma/migrations/manual/scada-index-cleanup.sql`

```sql
DROP INDEX IF EXISTS scada_measurements_tenantId_idx;
DROP INDEX IF EXISTS scada_measurements_tenantId_turbineId_idx;
-- Behalten: composite mit timestamp + [turbineId, timestamp] für non-tenant jobs
```

Schema-Annotations entsprechend updaten.

### 7.3 Foreign-Key-Indexes ergänzen (M3) — ~30min
`prisma/schema.prisma`:
- `Park`: `@@index([operatorFundId])` + `@@index([billingEntityFundId])`
- `Lease`: `@@index([contractPartnerFundId])` + `@@index([directBillingFundId])`
- Audit weitere FK-Felder im Schema

### 7.4 Composite Index für Dunning/Fälligkeit (M4) — ~30min
`prisma/schema.prisma` — auf `Invoice`, `IncomingInvoice`, `OperationalTask`, `Defect`:
- `@@index([tenantId, status, dueDate])`
- alte einzelne `[status]` + `[dueDate]` droppen

### 7.5 loadTurbines + loadAdvancePayments N+1 (M5, M6) — ~1h
- `loadTurbines`: aus Schleife in Caller ziehen, 1 Mal aufrufen
- `loadAdvancePayments` in `calculator.ts:882`: batch `findMany` mit `IN`-Liste + group in JS

**Verifikation:** Migration läuft. tsc/lint/build/vitest grün.

**Commit:** `perf(db): Phase 7 — SCADA N+1 fix + Index-Cleanup + FK-Indexes + N+1 in calculator`

---

## Phase 8 — Code-Hygiene (MEDIUM) — ~1.5h

### 8.1 7 Files mit raw NextResponse → apiError (M1)
- `src/app/api/admin/contracts/auto-renew/route.ts:45-54`
- `src/app/api/admin/backup/route.ts:146-152`
- `src/app/api/admin/jobs/stats/route.ts:39-56, 78-95`
- `src/app/api/admin/email/route.ts`
- `src/app/api/admin/email/test/route.ts`
- `src/app/api/admin/billing-rules/[id]/execute/route.ts`
- `src/app/api/auth/reset-password/route.ts:36-46`

Pattern: `NextResponse.json({error: "..."}, {status: 500})` → `apiError("INTERNAL_ERROR", 500, {message: "..."})`.

**Commit:** `chore(api): Phase 8 — 7 Routes auf apiError-Pattern umstellen`

---

## 📊 Gesamtaufwand & Dependency-Graph

```
Phase 1 (1.5h) ──────────────────────────────────────────┐
                                                          │
Phase 2 (7h) ────────────────────────────────────────────┤
   ├── 2.3 updateWithAudit ist Prerequisite für 2.2     │
                                                          │
Phase 3 (3h) ────────────────────────────────────────────┤  Independent,
                                                          │  kann nach Phase 1+2
Phase 4 (5h) ────────────────────────────────────────────┤  in beliebiger
                                                          │  Reihenfolge
Phase 5 (5h) ──┬─ Decision required (H3) BEFORE start ───┤
               └─ depends on user input                  │
                                                          │
Phase 6 (3h) ────────────────────────────────────────────┤
                                                          │
Phase 7 (3h) ──┬─ Migration: prüfen ob db push möglich ──┤
               └─ kann parallel zu Code-Phasen laufen    │
                                                          │
Phase 8 (1.5h) ──────────────────────────────────────────┘

TOTAL: ~28-32h reine Coding+Test+Commit Zeit
```

---

## 🚦 Empfohlene Ausführungsreihenfolge

**Tag 1 (~10h):** Phase 1 + 2 + 3
→ Damit sind alle CRITICAL Findings durch. Real-Test wäre ab hier sicher möglich.

**Tag 2 (~8h):** Phase 4 + 6
→ Compliance + API-Hardening durch.

**Tag 3 (~5h):** Phase 7 + 8
→ Performance + Hygiene.

**Tag 4 (~5h):** Phase 5 (nach H3-Decision)
→ Settlement-Refactor mit Klarheit über Architektur.

**Insgesamt:** ~28h verteilt auf 3-4 Tage konzentrierte Arbeit. Realistisch in einer Woche durch wenn fokussiert.

---

## ⚠️ Risiken & Mitigation

| Risiko | Mitigation |
|--------|------------|
| Phase 7 Migration auf Prod-DB schlägt fehl | Backup vor jeder Migration. Test auf Staging zuerst. Migrations als `CREATE INDEX CONCURRENTLY` |
| Phase 2 Refactor bricht existierende Invoices | Bestehende Invoices unverändert lassen. Migration ist ADD only, kein modify. Snapshot-Tests vorher |
| Phase 5 Doppel-Architektur — falsches System gelöscht | UI-Audit vorher = Pflicht. Beide Systeme sind aktiv in der UI verwendet |
| Phase 6 Zod-Schemas zu strikt → bricht Frontend-Calls | Pro Route: erst Feldsig prüfen (was sendet das Frontend tatsächlich?), dann Zod permissiv |
| Token-Budget reicht nicht | Jede Phase ist ein eigener Commit. Pause nach 2-3 Phasen, neue Session starten ist OK |

---

## 🎯 Mein Vorschlag zum Start

Wenn du startest:

1. **Phase 5 H3 Entscheidung NICHT JETZT** — ich starte Phase 5 als letzte und decide-on-the-fly basierend auf UI-Audit
2. **Phase 1 sofort als Quick-Win** — du siehst direktes Resultat in 1-2 Stunden
3. **Pause-Punkte:** Nach Phase 1, nach Phase 3, nach Phase 6, nach Phase 7

**Soll ich mit Phase 1 anfangen?**

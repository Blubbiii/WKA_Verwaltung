# API Conventions (WindparkManager)

Verbindliche Konventionen für alle neuen API-Routes unter `src/app/api/**`.

Status: Mai 2026 — Codebase nach Audit-Refactor ~100 % strukturiert. Inkonsistente Altrouten werden via Codemod-Follow-up nachgezogen (siehe unten).

---

## 1. Response-Envelope

### Single-Resource

```ts
// GET /api/invoices/[id]
return NextResponse.json({ data: invoice });
```

### List + Pagination (Offset)

```ts
// GET /api/invoices?page=2
return NextResponse.json({
  data: invoices,
  meta: { total, page, pageSize },
});
```

### List + Pagination (Cursor, Sprint-2-Pattern)

```ts
// GET /api/journal-entries?cursor=...&limit=50
return NextResponse.json({
  data: entries,
  meta: { nextCursor: lastId ?? null, hasMore },
});
```

Cursor = letzter `id` der vorherigen Page. `nextCursor: null` ⇒ Ende erreicht.
Limit IMMER aus `PAGE_SIZE_DEFAULT/LARGE/DROPDOWN` (`@/lib/config/pagination`) — niemals hardcoded.

### Empty Body (204 / 202)

204 No Content für erfolgreiche Mutations ohne Returnwert.
202 PENDING_APPROVAL für Mutations, die einen Approval-Workflow auslösen (siehe §3).

---

## 2. Error-Pattern

**IMMER** über `apiError(code, status, { message?, details? })` aus `@/lib/api-errors`.
**NIEMALS** `NextResponse.json({ error: ... })` direkt.

```ts
import { apiError } from "@/lib/api-errors";

if (!session) return apiError("UNAUTHORIZED", 401);
if (!plot)    return apiError("PLOT_NOT_FOUND", 404, { message: `Plot ${id} not found` });
if (parse.success === false) {
  return apiError("VALIDATION_FAILED", 400, { details: parse.error.flatten() });
}
```

Shape garantiert:

```json
{ "error": { "code": "PLOT_NOT_FOUND", "message": "Plot 42 not found" } }
```

`code` ist die machine-readable Identität — Frontends matchen darauf, nicht auf `message`.

Eine ESLint-Rule (`no-restricted-syntax`) warnt bei direktem `NextResponse.json({error:...})` in `src/app/api/**/route.ts` (WARN-Level, nicht blocking während Migration).

---

## 3. 202 PENDING_APPROVAL (Sprint-3-Pattern)

Mutations, die einen Vier-Augen-Approval-Flow triggern (z. B. Auszahlungen, Storno
von Buchungssätzen), antworten **nicht** synchron mit dem mutierten Objekt,
sondern mit dem erzeugten Approval-Request:

```ts
return NextResponse.json(
  {
    data: { approvalRequestId, status: "PENDING_APPROVAL" },
    meta: { requiresApprovers: 2 },
  },
  { status: 202 }
);
```

Frontend behandelt 202 als „erfolgreich eingereicht, wartet auf Freigabe" —
kein Fehler-Toast, sondern Hinweis + Polling/Subscription auf Approval-Status.

---

## 4. Cursor-Pagination (Sprint-2-Pattern) im Detail

Verwendung bei großen, monoton wachsenden Listen (Journal-Entries, Audit-Log,
Energiedaten). Vorteil ggü. Offset: stabil bei gleichzeitigen Inserts, O(log n)
DB-Performance via Index.

Konvention:

- Query-Param: `cursor` (opak: id oder base64-encoded compound key).
- Query-Param: `limit` — default `PAGE_SIZE_DEFAULT`, max `PAGE_SIZE_LARGE`.
- Sort: standardmäßig `id desc` (neueste zuerst) — Route darf abweichen, muss
  aber dokumentieren.
- Response `meta.nextCursor`: `null` ⇒ Ende; sonst opaker String, den der
  Client unverändert zurückreicht.

---

## 5. Beispiele aus dem Codebase

Gut-strukturierte Routes zum Nachschlagen:

- `src/app/api/invoices/route.ts` — Offset-Pagination + `apiError`.
- `src/app/api/journal-entries/route.ts` — Cursor-Pagination + Validierung via Zod.
- `src/app/api/approvals/*` — 202 PENDING_APPROVAL Flow.

---

## 6. Follow-up: Codemod für Alt-Routen

Restliche Inkonsistenzen (~5 % aller Routes) werden via Codemod nachgezogen:

```bash
# Geplant — noch nicht implementiert
npx tsx scripts/codemod-api-errors.ts
```

Bis dahin: ESLint-Warning weist Migrant:innen beim Editieren auf das richtige Pattern hin.

import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client-runtime-utils";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { assertPeriodOpen, PeriodLockedError } from "@/lib/accounting/period-lock";

// ============================================================================
// VALIDATION
// ============================================================================

const lineSchema = z.object({
  lineNumber: z.number().int().positive(),
  account: z.string().min(1).max(20),
  accountName: z.string().max(100).optional(),
  description: z.string().max(200).optional(),
  debitAmount: z.number().min(0).optional(),
  creditAmount: z.number().min(0).optional(),
  taxKey: z.string().max(10).optional(),
  costCenter: z.string().max(50).optional(),
});

const updateSchema = z.object({
  entryDate: z
    .iso.datetime()
    .optional()
    // F13-Compliance: GoBD §146 AO — Buchungsdatum darf nicht in der Zukunft
    // liegen. Verhindert Vorbuchungen (Bilanzmanipulation / falsche Periode).
    .refine(
      (v) => !v || new Date(v).getTime() <= Date.now(),
      { message: "Buchungsdatum darf nicht in der Zukunft liegen" },
    ),
  description: z.string().min(1).max(200).optional(),
  reference: z.string().max(100).optional().nullable(),
  lines: z
    .array(lineSchema)
    .min(2)
    .refine(
      (lines) =>
        lines.every(
          (l) =>
            (l.debitAmount !== undefined && l.debitAmount > 0) !==
            (l.creditAmount !== undefined && l.creditAmount > 0)
        ),
      "Jede Zeile muss entweder Soll oder Haben haben"
    )
    .optional(),
});

// ============================================================================
// GET /api/journal-entries/[id]
// ============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const entry = await prisma.journalEntry.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      include: {
        lines: { orderBy: { lineNumber: "asc" } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!entry) {
      return apiError("NOT_FOUND", 404, { message: "Buchung nicht gefunden" });
    }

    return NextResponse.json(serializePrisma(entry));
  } catch (error) {
    logger.error({ err: error }, "Error fetching journal entry");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden" });
  }
}

// ============================================================================
// PUT /api/journal-entries/[id]
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.journalEntry.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      select: { id: true, status: true, entryDate: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Buchung nicht gefunden" });
    }

    if (existing.status !== "DRAFT") {
      return apiError("BAD_REQUEST", 400, { message: "Nur Entwürfe können bearbeitet werden" });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, { message: parsed.error.issues[0]?.message || "Ungültige Eingabedaten" });
    }

    const { entryDate, description, reference, lines } = parsed.data;

    // P9: Gate gegen Periodensperre. Sowohl ALTE Periode (Snapshot vor Update)
    // als auch NEUE Periode (falls entryDate geändert) müssen offen sein.
    try {
      await assertPeriodOpen(check.tenantId!, existing.entryDate);
      if (entryDate) {
        await assertPeriodOpen(check.tenantId!, new Date(entryDate));
      }
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return apiError("PERIOD_LOCKED", 409, {
          message: err.message,
          details: { periodYear: err.periodYear, periodMonth: err.periodMonth },
        });
      }
      throw err;
    }

    // Soll=Haben-Validierung auch bei DRAFT-Update (Decimal, Toleranz 0.005).
    if (lines !== undefined) {
      let totalDebitDec = new Decimal(0);
      let totalCreditDec = new Decimal(0);
      for (const l of lines) {
        totalDebitDec = totalDebitDec.plus(l.debitAmount ?? 0);
        totalCreditDec = totalCreditDec.plus(l.creditAmount ?? 0);
      }
      if (totalDebitDec.minus(totalCreditDec).abs().greaterThanOrEqualTo(0.005)) {
        return apiError("BAD_REQUEST", 400, {
          message: `Buchung nicht ausgeglichen: Soll ${totalDebitDec.toFixed(2)} € ≠ Haben ${totalCreditDec.toFixed(2)} €`,
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (lines !== undefined) {
        // Replace all lines
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: id } });
        await tx.journalEntryLine.createMany({
          data: lines.map((l) => ({
            journalEntryId: id,
            lineNumber: l.lineNumber,
            account: l.account,
            accountName: l.accountName || null,
            description: l.description || null,
            debitAmount: l.debitAmount ?? null,
            creditAmount: l.creditAmount ?? null,
            taxKey: l.taxKey || null,
            costCenter: l.costCenter || null,
          })),
        });
      }

      // tenantId in where (TOCTOU-Schutz, consistent zur DELETE-Variante).
      return tx.journalEntry.update({
        where: { id, tenantId: check.tenantId! },
        data: {
          ...(entryDate ? { entryDate: new Date(entryDate) } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(reference !== undefined ? { reference } : {}),
        },
        include: { lines: { orderBy: { lineNumber: "asc" } } },
      });
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating journal entry");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren" });
  }
}

// ============================================================================
// DELETE /api/journal-entries/[id]
// ============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.journalEntry.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      select: { id: true, status: true, entryDate: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Buchung nicht gefunden" });
    }

    if (existing.status !== "DRAFT") {
      return apiError("BAD_REQUEST", 400, { message: "Nur Entwürfe können gelöscht werden" });
    }

    try {
      await assertPeriodOpen(check.tenantId!, existing.entryDate);
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return apiError("PERIOD_LOCKED", 409, {
          message: err.message,
          details: { periodYear: err.periodYear, periodMonth: err.periodMonth },
        });
      }
      throw err;
    }

    // tenantId im WHERE (TOCTOU-Schutz, consistent zur PUT-Variante).
    await prisma.journalEntry.update({
      where: { id, tenantId: check.tenantId! },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting journal entry");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Löschen" });
  }
}

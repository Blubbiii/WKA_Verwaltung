import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

// ============================================================================
// POST /api/journal-entries/[id]/post
// Transitions a DRAFT journal entry to POSTED after validating debit = credit.
// ============================================================================

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const entry = await prisma.journalEntry.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      include: { lines: true },
    });

    if (!entry) {
      return NextResponse.json({ error: "Buchung nicht gefunden" }, { status: 404 });
    }

    if (entry.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Nur Entwürfe können gebucht werden" },
        { status: 400 }
      );
    }

    if (entry.lines.length < 2) {
      return NextResponse.json(
        { error: "Mindestens 2 Buchungszeilen erforderlich" },
        { status: 400 }
      );
    }

    // Validate debit = credit
    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of entry.lines) {
      totalDebit += Number(line.debitAmount ?? 0);
      totalCredit += Number(line.creditAmount ?? 0);
    }

    if (Math.abs(totalDebit - totalCredit) >= 0.005) {
      return NextResponse.json(
        {
          error: `Buchung nicht ausgeglichen: Soll ${totalDebit.toFixed(2)} € ≠ Haben ${totalCredit.toFixed(2)} €`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.journalEntry.update({
      where: { id },
      data: { status: "POSTED" },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        entryId: id,
        totalDebit,
        totalCredit,
      },
      "Journal entry posted"
    );

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error posting journal entry");
    return NextResponse.json(
      { error: "Fehler beim Buchen" },
      { status: 500 }
    );
  }
}

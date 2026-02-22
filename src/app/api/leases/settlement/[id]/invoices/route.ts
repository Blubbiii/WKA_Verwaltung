import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import {
  generateAdvanceInvoices,
  generateSettlementInvoices,
} from "@/lib/lease-revenue/invoice-generator";

// =============================================================================
// POST /api/leases/settlement/[id]/invoices - Generate credit notes (Gutschriften)
//
// For ADVANCE settlements: generates advance invoices (Vorschuss-Gutschriften)
// For FINAL settlements: generates settlement invoices (Endabrechnungs-Gutschriften)
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Load settlement to determine period type and verify ownership + status
    const settlement = await prisma.leaseRevenueSettlement.findFirst({
      where: {
        id,
        ...(check.tenantId ? { tenantId: check.tenantId } : {}),
      },
      include: {
        items: true,
        park: { select: { id: true, name: true } },
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: "Nutzungsentgelt-Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (settlement.items.length === 0) {
      return NextResponse.json(
        {
          error: "Keine Positionen vorhanden",
          details: "Bitte zuerst die Berechnung durchfuehren.",
        },
        { status: 400 }
      );
    }

    const isAdvance = settlement.periodType === "ADVANCE";

    if (isAdvance) {
      // ADVANCE: generate advance invoices
      if (settlement.status !== "CALCULATED") {
        return NextResponse.json(
          {
            error: "Vorschussrechnungen koennen nur fuer berechnete Abrechnungen erstellt werden",
            details: `Aktueller Status: ${settlement.status}. Bitte zuerst die Berechnung durchfuehren.`,
          },
          { status: 400 }
        );
      }

      const result = await generateAdvanceInvoices(
        check.tenantId!,
        id,
        check.userId
      );

      return NextResponse.json(serializePrisma(result));
    } else {
      // FINAL: generate settlement invoices (remainder after advances)
      if (
        settlement.status !== "CALCULATED" &&
        settlement.status !== "ADVANCE_CREATED"
      ) {
        return NextResponse.json(
          {
            error: "Endabrechnungs-Gutschriften koennen nur fuer berechnete Abrechnungen erstellt werden",
            details: `Aktueller Status: ${settlement.status}. Bitte zuerst die Berechnung durchfuehren.`,
          },
          { status: 400 }
        );
      }

      const result = await generateSettlementInvoices(
        check.tenantId!,
        id,
        check.userId
      );

      return NextResponse.json(serializePrisma(result));
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    if (message.includes("nicht gefunden") || message.includes("Status")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    logger.error(
      { err: error },
      "Error generating invoices for lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Gutschriften" },
      { status: 500 }
    );
  }
}

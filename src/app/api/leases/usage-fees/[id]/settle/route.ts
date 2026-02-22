import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { generateSettlementInvoices } from "@/lib/lease-revenue/invoice-generator";

// =============================================================================
// POST /api/leases/usage-fees/[id]/settle - Generate settlement invoices (Endabrechnung)
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Load settlement and verify ownership + status
    const settlement = await prisma.leaseRevenueSettlement.findFirst({
      where: { id, tenantId: check.tenantId! },
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

    // Settlement invoices can be created from CALCULATED or ADVANCE_CREATED status
    if (
      settlement.status !== "CALCULATED" &&
      settlement.status !== "ADVANCE_CREATED"
    ) {
      return NextResponse.json(
        {
          error: "Endabrechnung kann nur fuer berechnete Abrechnungen erstellt werden",
          details: `Aktueller Status: ${settlement.status}. Bitte zuerst die Berechnung durchfuehren.`,
        },
        { status: 400 }
      );
    }

    if (settlement.items.length === 0) {
      return NextResponse.json(
        { error: "Keine Positionen vorhanden. Bitte zuerst die Berechnung durchfuehren." },
        { status: 400 }
      );
    }

    const result = await generateSettlementInvoices(check.tenantId!, id, check.userId);
    return NextResponse.json(serializePrisma(result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    if (message.includes("nicht gefunden") || message.includes("Status")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    logger.error(
      { err: error },
      "Error generating settlement invoices for lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Endabrechnung" },
      { status: 500 }
    );
  }
}

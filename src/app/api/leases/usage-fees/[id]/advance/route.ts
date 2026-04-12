import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { generateAdvanceInvoices } from "@/lib/lease-revenue/invoice-generator";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// POST /api/leases/usage-fees/[id]/advance - Generate advance invoices (Vorschussrechnungen)
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
      return apiError("NOT_FOUND", undefined, { message: "Nutzungsentgelt-Abrechnung nicht gefunden" });
    }

    // Advance invoices can only be created from CALCULATED status
    if (settlement.status !== "CALCULATED") {
      return apiError("BAD_REQUEST", undefined, { message: "Vorschussrechnungen können nur für berechnete Abrechnungen erstellt werden", details: `Aktueller Status: ${settlement.status}. Bitte zuerst die Berechnung durchfuehren.` });
    }

    if (settlement.items.length === 0) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Positionen vorhanden. Bitte zuerst die Berechnung durchfuehren." });
    }

    const result = await generateAdvanceInvoices(check.tenantId!, id, check.userId);
    return NextResponse.json(serializePrisma(result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    if (message.includes("nicht gefunden") || message.includes("Status")) {
      return apiError("BAD_REQUEST", undefined, { message: message });
    }

    logger.error(
      { err: error },
      "Error generating advance invoices for lease revenue settlement"
    );
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen der Vorschussrechnungen" });
  }
}

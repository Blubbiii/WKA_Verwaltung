import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { generateAllocationInvoices } from "@/lib/lease-revenue/invoice-generator";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// POST /api/leases/cost-allocation/[id]/invoice - Generate allocation invoices
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Load allocation and verify ownership + status
    const allocation = await prisma.parkCostAllocation.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        items: {
          include: {
            operatorFund: {
              select: { id: true, name: true },
            },
          },
        },
        leaseRevenueSettlement: {
          select: {
            id: true,
            year: true,
            park: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!allocation) {
      return apiError("NOT_FOUND", undefined, { message: "Kostenaufteilung nicht gefunden" });
    }

    // Only DRAFT allocations can generate invoices
    if (allocation.status !== "DRAFT") {
      return apiError("BAD_REQUEST", undefined, { message: "Rechnungen können nur für Kostenaufteilungen im Entwurf-Status erstellt werden", details: `Aktueller Status: ${allocation.status}` });
    }

    if (allocation.items.length === 0) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Positionen vorhanden. Bitte zuerst die Kostenaufteilung berechnen." });
    }

    const result = await generateAllocationInvoices(check.tenantId!, id, check.userId);
    return NextResponse.json(serializePrisma(result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    if (message.includes("nicht gefunden") || message.includes("Status")) {
      return apiError("BAD_REQUEST", undefined, { message: message });
    }

    logger.error(
      { err: error },
      "Error generating allocation invoices"
    );
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen der Kostenaufteilungs-Rechnungen" });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { generateAllocationInvoices } from "@/lib/lease-revenue/invoice-generator";

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
      return NextResponse.json(
        { error: "Kostenaufteilung nicht gefunden" },
        { status: 404 }
      );
    }

    // Only DRAFT allocations can generate invoices
    if (allocation.status !== "DRAFT") {
      return NextResponse.json(
        {
          error: "Rechnungen koennen nur fuer Kostenaufteilungen im Entwurf-Status erstellt werden",
          details: `Aktueller Status: ${allocation.status}`,
        },
        { status: 400 }
      );
    }

    if (allocation.items.length === 0) {
      return NextResponse.json(
        { error: "Keine Positionen vorhanden. Bitte zuerst die Kostenaufteilung berechnen." },
        { status: 400 }
      );
    }

    const result = await generateAllocationInvoices(check.tenantId!, id, check.userId);
    return NextResponse.json(serializePrisma(result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    if (message.includes("nicht gefunden") || message.includes("Status")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    logger.error(
      { err: error },
      "Error generating allocation invoices"
    );
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Kostenaufteilungs-Rechnungen" },
      { status: 500 }
    );
  }
}

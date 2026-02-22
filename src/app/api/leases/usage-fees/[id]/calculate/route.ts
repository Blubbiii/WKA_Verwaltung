import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { executeSettlementCalculation } from "@/lib/lease-revenue/calculator";

// =============================================================================
// POST /api/leases/usage-fees/[id]/calculate - Run settlement calculation
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const { settlement, calculation } = await executeSettlementCalculation(
      check.tenantId!,
      id,
      check.userId
    );

    return NextResponse.json(
      serializePrisma({
        settlement,
        calculation,
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    // Business logic errors (missing config, wrong status, etc.)
    if (
      message.includes("nicht gefunden") ||
      message.includes("fehlt") ||
      message.includes("nicht berechnet") ||
      message.includes("konfiguriert") ||
      message.includes("Status")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    logger.error(
      { err: error },
      "Error calculating lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler bei der Berechnung des Nutzungsentgelts" },
      { status: 500 }
    );
  }
}

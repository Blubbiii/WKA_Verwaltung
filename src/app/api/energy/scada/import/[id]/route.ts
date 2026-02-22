import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/import/[id] - Status eines einzelnen Import-Logs
// Wird vom Frontend per Polling abgefragt, um den Fortschritt anzuzeigen
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const log = await prisma.scadaImportLog.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!log) {
      return NextResponse.json(
        { error: "Import-Log nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(log);
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden des Import-Logs");
    return NextResponse.json(
      { error: "Fehler beim Laden des Import-Logs" },
      { status: 500 }
    );
  }
}

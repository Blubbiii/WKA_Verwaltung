import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  getAutoImportStatus,
  toggleAutoImport,
} from "@/lib/scada/auto-import-service";
import { enqueueScadaAutoImportForTenant } from "@/lib/queue";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/auto-import
// Returns auto-import configuration and status for all locations
// =============================================================================

export async function GET() {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const status = await getAutoImportStatus(check.tenantId!);

    return NextResponse.json({ data: status });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden des Auto-Import Status");
    return NextResponse.json(
      { error: "Fehler beim Laden des Auto-Import Status" },
      { status: 500 },
    );
  }
}

// =============================================================================
// POST /api/energy/scada/auto-import
// Toggle auto-import or trigger manual run
//
// Body:
//   { action: "enable" | "disable" | "run-now" | "configure",
//     locationCode?: string,   // required for enable/disable/configure
//     interval?: string,       // DAILY, HOURLY, WEEKLY (for enable/configure)
//     autoImportPath?: string  // Override base path (for enable/configure)
//   }
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { action, locationCode, interval, autoImportPath } = body;

    if (!action || typeof action !== "string") {
      return NextResponse.json(
        { error: "action ist erforderlich (enable, disable, run-now, configure)" },
        { status: 400 },
      );
    }

    switch (action) {
      case "enable": {
        if (!locationCode) {
          return NextResponse.json(
            { error: "locationCode ist erforderlich für enable" },
            { status: 400 },
          );
        }

        const count = await toggleAutoImport(
          check.tenantId!,
          locationCode,
          true,
          interval,
          autoImportPath,
        );

        return NextResponse.json({
          message: `Auto-Import aktiviert für ${locationCode}`,
          updatedMappings: count,
        });
      }

      case "disable": {
        if (!locationCode) {
          return NextResponse.json(
            { error: "locationCode ist erforderlich für disable" },
            { status: 400 },
          );
        }

        const count = await toggleAutoImport(
          check.tenantId!,
          locationCode,
          false,
        );

        return NextResponse.json({
          message: `Auto-Import deaktiviert für ${locationCode}`,
          updatedMappings: count,
        });
      }

      case "configure": {
        if (!locationCode) {
          return NextResponse.json(
            { error: "locationCode ist erforderlich für configure" },
            { status: 400 },
          );
        }

        if (interval && !["DAILY", "HOURLY", "WEEKLY"].includes(interval)) {
          return NextResponse.json(
            { error: "interval muss DAILY, HOURLY oder WEEKLY sein" },
            { status: 400 },
          );
        }

        const count = await toggleAutoImport(
          check.tenantId!,
          locationCode,
          true, // keep enabled
          interval,
          autoImportPath !== undefined ? autoImportPath : undefined,
        );

        return NextResponse.json({
          message: `Auto-Import konfiguriert für ${locationCode}`,
          updatedMappings: count,
        });
      }

      case "run-now": {
        // Trigger immediate auto-import for this tenant via the queue
        const job = await enqueueScadaAutoImportForTenant(
          check.tenantId!,
          true, // manual trigger
        );

        return NextResponse.json(
          {
            message: "Auto-Import wird im Hintergrund gestartet",
            jobId: job.id,
          },
          { status: 202 },
        );
      }

      default:
        return NextResponse.json(
          { error: `Unbekannte Aktion: ${action}. Erlaubt: enable, disable, run-now, configure` },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error({ err: error }, "Fehler bei Auto-Import Aktion");
    return NextResponse.json(
      { error: "Fehler bei Auto-Import Aktion" },
      { status: 500 },
    );
  }
}

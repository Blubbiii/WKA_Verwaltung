import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  getAutoImportStatus,
  toggleAutoImport,
} from "@/lib/scada/auto-import-service";
import { enqueueScadaAutoImportForTenant } from "@/lib/queue";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const postAutoImportSchema = z.object({
  action: z.enum(["enable", "disable", "run-now", "configure"]),
  locationCode: z.string().optional(),
  interval: z.enum(["DAILY", "HOURLY", "WEEKLY"]).optional(),
  autoImportPath: z.string().optional(),
});

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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden des Auto-Import Status" });
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
    const parsed = postAutoImportSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { action, locationCode, interval, autoImportPath } = parsed.data;

    switch (action) {
      case "enable": {
        if (!locationCode) {
          return apiError("MISSING_FIELD", undefined, { message: "locationCode ist erforderlich für enable" });
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
          return apiError("MISSING_FIELD", undefined, { message: "locationCode ist erforderlich für disable" });
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
          return apiError("MISSING_FIELD", undefined, { message: "locationCode ist erforderlich für configure" });
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
        return apiError("BAD_REQUEST", undefined, { message: `Unbekannte Aktion: ${action}. Erlaubt: enable, disable, run-now, configure` });
    }
  } catch (error) {
    logger.error({ err: error }, "Fehler bei Auto-Import Aktion");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler bei Auto-Import Aktion" });
  }
}

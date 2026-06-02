/**
 * POST /api/buchhaltung/datev-export
 *
 * DATEV EXTF-CSV-Export für Steuerberater-Import.
 *
 * Body: {
 *   from: "YYYY-MM-DD",
 *   to: "YYYY-MM-DD",
 *   datevConsultantNumber?: number,  // aus TenantSettings
 *   datevClientNumber?: number       // aus TenantSettings
 * }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateDatevExport } from "@/lib/accounting/datev-export";
import { getTenantSettings } from "@/lib/tenant-settings";

const schema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  datevConsultantNumber: z.number().int().optional(),
  datevClientNumber: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return apiError("BAD_REQUEST", 400, { message: "Ungültiges Datum" });
    }

    const settings = await getTenantSettings(check.tenantId);
    const fiscalYearStart = new Date(
      Date.UTC(from.getUTCFullYear(), settings.fiscalYearStartMonth - 1, 1),
    );

    // DATEV-Nummern: Body > TenantSettings > Defaults (kann der StB im Vorlauf setzen)
    const consultantNumber =
      parsed.data.datevConsultantNumber ?? 99999;
    const clientNumber =
      parsed.data.datevClientNumber ?? 1;

    const result = await generateDatevExport({
      tenantId: check.tenantId,
      datevConsultantNumber: consultantNumber,
      datevClientNumber: clientNumber,
      fiscalYearStart,
      periodStart: from,
      periodEnd: to,
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        from: parsed.data.from,
        to: parsed.data.to,
        recordCount: result.recordCount,
      },
      "DATEV-Export erstellt",
    );

    return new Response(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-DATEV-Record-Count": String(result.recordCount),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "DATEV-Export fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "DATEV-Export fehlgeschlagen" });
  }
}

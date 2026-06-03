/**
 * POST /api/buchhaltung/bundesanzeiger
 *
 * C-3 Sprint 5: Bundesanzeiger-XBRL-Export für §325 HGB Offenlegung.
 *
 * Body: { fiscalYear, asOf, companySize, companyName, handelsregisterNummer?, registeredOffice? }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateBundesanzeigerXbrl } from "@/lib/accounting/bundesanzeiger-xbrl";

const schema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  asOf: z.string().min(1),
  companySize: z.enum(["kleinst", "klein", "mittel", "gross"]),
  companyName: z.string().min(1).max(200),
  handelsregisterNummer: z.string().max(100).optional(),
  registeredOffice: z.string().max(100).optional(),
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

    const asOf = new Date(parsed.data.asOf);
    if (isNaN(asOf.getTime())) {
      return apiError("BAD_REQUEST", 400, { message: "Ungültiges Datum" });
    }

    const result = await generateBundesanzeigerXbrl({
      tenantId: check.tenantId,
      fiscalYear: parsed.data.fiscalYear,
      asOf,
      companySize: parsed.data.companySize,
      companyName: parsed.data.companyName,
      handelsregisterNummer: parsed.data.handelsregisterNummer,
      registeredOffice: parsed.data.registeredOffice,
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        fiscalYear: parsed.data.fiscalYear,
        positionCount: result.positionCount,
        readyForSubmission: result.readyForSubmission,
      },
      "Bundesanzeiger-XBRL erzeugt (keine Einreichung)",
    );

    return new Response(result.xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Bundesanzeiger-Position-Count": String(result.positionCount),
        "X-Bundesanzeiger-Ready": String(result.readyForSubmission),
        "X-Bundesanzeiger-Warnings": String(result.warnings.length),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Bundesanzeiger-XBRL fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "Bundesanzeiger-XBRL fehlgeschlagen",
    });
  }
}

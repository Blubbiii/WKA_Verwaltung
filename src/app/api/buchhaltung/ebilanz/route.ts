/**
 * POST /api/buchhaltung/ebilanz
 *
 * Generiert E-Bilanz §5b EStG XBRL-Export für ELSTER-Übermittlung.
 *
 * Body: { fiscalYear, asOf, taxNumber, vatId?, companyName?, legalForm }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateEbilanz } from "@/lib/accounting/ebilanz";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  asOf: z.string().min(1),
  taxNumber: z.string().min(5).max(50),
  vatId: z.string().max(50).optional(),
  companyName: z.string().min(1).max(200).optional(),
  legalForm: z.enum(["KS", "PE", "EU"]),
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

    // Falls kein companyName: aus Tenant lesen
    let companyName = parsed.data.companyName;
    if (!companyName) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { name: true },
      });
      companyName = tenant?.name ?? "Unbekannt";
    }

    const result = await generateEbilanz({
      tenantId: check.tenantId,
      fiscalYear: parsed.data.fiscalYear,
      asOf,
      companyName,
      taxNumber: parsed.data.taxNumber,
      vatId: parsed.data.vatId,
      legalForm: parsed.data.legalForm,
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        fiscalYear: parsed.data.fiscalYear,
        positionCount: result.positionCount,
        ebilanzReady: result.ebilanzReady,
      },
      "E-Bilanz generiert",
    );

    return new Response(result.xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Ebilanz-Position-Count": String(result.positionCount),
        "X-Ebilanz-Ready": String(result.ebilanzReady),
        "X-Ebilanz-Warnings": String(result.warnings.length),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "E-Bilanz-Export fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "E-Bilanz-Export fehlgeschlagen" });
  }
}

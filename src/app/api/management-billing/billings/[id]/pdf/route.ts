/**
 * Management Billing PDF Download
 *
 * GET - Download PDF for a billing's invoice
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { id } = await params;

    const billing = await prisma.managementBilling.findUnique({
      where: { id },
      include: {
        stakeholder: true,
      },
    });

    if (!billing) {
      return apiError("NOT_FOUND", 404, { message: "Abrechnung nicht gefunden" });
    }

    // Access control
    if (
      check.tenantId &&
      billing.stakeholder.stakeholderTenantId !== check.tenantId
    ) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    if (!billing.invoiceId) {
      return apiError("BAD_REQUEST", 400, { message: "Keine Rechnung vorhanden. Bitte zuerst eine Rechnung erstellen." });
    }

    // Use existing PDF generation pipeline
    const { generateInvoicePdf } = await import("@/lib/pdf");

    const buffer = await generateInvoicePdf(billing.invoiceId);

    const periodLabel = billing.month
      ? `${String(billing.month).padStart(2, "0")}-${billing.year}`
      : `${billing.year}`;

    const filename = `BF-Rechnung-${periodLabel}.pdf`;

    const uint8 = new Uint8Array(buffer);
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] PDF download error");
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler beim Generieren der PDF" });
  }
}

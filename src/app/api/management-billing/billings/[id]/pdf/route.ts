/**
 * Management Billing PDF Download
 *
 * GET - Download PDF for a billing's invoice
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
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
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Access control
    if (
      check.tenantId &&
      billing.stakeholder.stakeholderTenantId !== check.tenantId
    ) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    if (!billing.invoiceId) {
      return NextResponse.json(
        { error: "Keine Rechnung vorhanden. Bitte zuerst eine Rechnung erstellen." },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Generieren der PDF" },
      { status: 500 }
    );
  }
}

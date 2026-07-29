/**
 * Close-Transition für LeaseSettlementPeriod.
 *
 * APPROVED → CLOSED.
 *
 * Fixt Workflow-Architect Finding R-2: vorher gab es keinen Code-Pfad
 * der eine genehmigte Periode auf CLOSED setzt → Perioden blieben ewig
 * im APPROVED-Status, kein "fertig"-Signal.
 *
 * Voraussetzung: Alle Invoices der Period müssen PAID oder CANCELLED
 * sein. Sonst 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

// POST /api/admin/settlement-periods/[id]/close
// APPROVED → CLOSED
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Close ist eine finale Statusänderung → nur Admin
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true },
    });

    if (!period) {
      return apiError("NOT_FOUND", undefined, {
        message: "Abrechnungsperiode nicht gefunden",
      });
    }

    if (period.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    if (period.status !== "APPROVED") {
      return apiError("CONFLICT", 409, {
        message: `Nur Perioden im Status "Genehmigt" können abgeschlossen werden. Aktueller Status: ${period.status}`,
      });
    }

    // Voraussetzung: jede Invoice der Period muss einen ENDZUSTAND erreicht
    // haben. SENT/DRAFT/PARTIALLY_PAID bedeutet: Verarbeitung noch offen,
    // Close würde ohne Abschluss-Ereignis zugemacht.
    //
    // Finding 1.7: WRITTEN_OFF fehlte hier. Eine per DIRECT_WRITEOFF
    // abgeschriebene Forderung (write-off.ts) ist buchhalterisch abgeschlossen
    // — Ausbuchung + ggf. §17-USt-Korrektur sind erfolgt, sie wird nie mehr
    // bezahlt. Ohne den Ausschluss war eine Periode nach einer einzigen
    // Forderungsabschreibung dauerhaft nicht mehr schließbar.
    const openInvoices = await prisma.invoice.count({
      where: {
        settlementPeriodId: id,
        tenantId: check.tenantId!,
        deletedAt: null,
        status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] },
      },
    });

    if (openInvoices > 0) {
      return apiError("CONFLICT", 409, {
        message: `Periode kann nicht abgeschlossen werden: ${openInvoices} Rechnung(en) noch nicht bezahlt, storniert oder abgeschrieben.`,
      });
    }

    const updated = await prisma.leaseSettlementPeriod.update({
      where: { id, tenantId: check.tenantId! },
      data: { status: "CLOSED" },
    });

    logger.info(
      { periodId: id, closedBy: check.userId, tenantId: check.tenantId },
      "Settlement period closed",
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "Fehler beim Abschliessen der Periode");
  }
}

/**
 * Submit-for-Review Endpoint für LeaseSettlementPeriod.
 *
 * Aktiviert die im approve-Endpoint vorgesehene Vier-Augen-Logik:
 * IN_PROGRESS → PENDING_REVIEW.
 *
 * Vorher (Workflow-Architect Finding R-1): es gab KEINE API die diesen
 * Übergang setzte → der approve-Endpoint (der PENDING_REVIEW als
 * Voraussetzung prüft) war unaufrufbar → Vier-Augen-Kontrolle war
 * effektiv tot.
 *
 * Nach dem submit kann ein ANDERER Admin (Vier-Augen!) den approve-Endpoint
 * aufrufen. Der submit selbst darf vom Creator gemacht werden (er reicht
 * seinen eigenen Vorschlag zur Prüfung ein).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

// POST /api/admin/settlement-periods/[id]/submit
// IN_PROGRESS → PENDING_REVIEW
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Submit darf jeder mit invoices:update — die eigentliche Approval
    // erfordert dann separat requireAdmin (siehe approve/route.ts).
    const check = await requirePermission("invoices:update");
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

    if (period.status !== "IN_PROGRESS") {
      return apiError("CONFLICT", 409, {
        message: `Nur Perioden im Status "In Bearbeitung" können zur Prüfung eingereicht werden. Aktueller Status: ${period.status}`,
      });
    }

    const updated = await prisma.leaseSettlementPeriod.update({
      where: { id, tenantId: check.tenantId! },
      data: { status: "PENDING_REVIEW" },
    });

    logger.info(
      { periodId: id, submittedBy: check.userId, tenantId: check.tenantId },
      "Settlement period submitted for review",
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "Fehler beim Einreichen zur Prüfung");
  }
}

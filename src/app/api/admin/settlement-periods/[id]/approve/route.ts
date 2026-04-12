import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { dispatchWebhook } from "@/lib/webhooks";
import { apiError } from "@/lib/api-errors";

const approveSchema = z.object({
  action: z.enum(["approve", "reject"]),
  notes: z.string().max(2000).optional().nullable(),
});

// POST /api/admin/settlement-periods/[id]/approve
// Actions: "approve" (PENDING_REVIEW -> APPROVED) or "reject" (PENDING_REVIEW -> IN_PROGRESS)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Approval requires admin-level permissions
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const { action, notes } = approveSchema.parse(body);

    // Fetch the current period
    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdById: true,
      },
    });

    if (!period) {
      return apiError("NOT_FOUND", undefined, { message: "Abrechnungsperiode nicht gefunden" });
    }

    if (period.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    // Only periods in PENDING_REVIEW can be approved or rejected
    if (period.status !== "PENDING_REVIEW") {
      return apiError("BAD_REQUEST", undefined, { message: `Nur Perioden im Status "Zur Prüfung" können genehmigt oder abgelehnt werden. Aktueller Status: ${period.status}` });
    }

    // Prevent self-approval: the creator cannot approve their own settlement
    if (period.createdById === check.userId) {
      return apiError("FORBIDDEN", undefined, { message: "Sie können Ihre eigenen Abrechnungsperioden nicht selbst genehmigen. Ein anderer Administrator muss die Prüfung durchfuehren." });
    }

    if (action === "approve") {
      const updated = await prisma.leaseSettlementPeriod.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedById: check.userId,
          reviewedAt: new Date(),
          reviewNotes: notes || null,
        },
        include: {
          park: { select: { id: true, name: true } },
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      logger.info(
        { periodId: id, userId: check.userId, action: "approve" },
        "Settlement period approved"
      );

      // Fire-and-forget webhook for settlement finalization
      dispatchWebhook(check.tenantId!, "settlement.finalized", {
        periodId: updated.id,
        year: updated.year,
        parkName: updated.park?.name ?? null,
        approvedBy: check.userId,
      }).catch((err) => { logger.warn({ err }, "[Webhook] Dispatch failed"); });

      return NextResponse.json({
        ...updated,
        message: "Abrechnungsperiode genehmigt",
      });
    } else {
      // Reject: set back to IN_PROGRESS with rejection notes
      if (!notes || notes.trim().length === 0) {
        return apiError("BAD_REQUEST", undefined, { message: "Bei einer Ablehnung muss eine Begruendung angegeben werden" });
      }

      const updated = await prisma.leaseSettlementPeriod.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          reviewedById: check.userId,
          reviewedAt: new Date(),
          reviewNotes: notes,
        },
        include: {
          park: { select: { id: true, name: true } },
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      logger.info(
        { periodId: id, userId: check.userId, action: "reject", notes },
        "Settlement period rejected"
      );

      return NextResponse.json({
        ...updated,
        message: "Abrechnungsperiode zurückgewiesen",
      });
    }
  } catch (error) {
    return handleApiError(error, "Fehler bei der Genehmigung der Abrechnungsperiode");
  }
}

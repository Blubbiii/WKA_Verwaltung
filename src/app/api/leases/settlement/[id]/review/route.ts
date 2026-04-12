import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const reviewActionSchema = z.object({
  action: z.enum(["submit", "approve", "reject"]),
  notes: z.string().max(2000).optional().nullable(),
});

// =============================================================================
// POST /api/leases/settlement/[id]/review - Submit for review, approve, or reject
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const { action, notes } = reviewActionSchema.parse(body);

    // Load settlement and verify tenant ownership
    const settlement = await prisma.leaseRevenueSettlement.findFirst({
      where: {
        id,
        ...(check.tenantId ? { tenantId: check.tenantId } : {}),
      },
    });

    if (!settlement) {
      return apiError("NOT_FOUND", undefined, { message: "Abrechnung nicht gefunden" });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updateData: any = {};

    switch (action) {
      case "submit": {
        // submit: status must be CALCULATED -> PENDING_REVIEW
        if (settlement.status !== "CALCULATED") {
          return apiError("BAD_REQUEST", undefined, { message: "Zur Prüfung einreichen nicht moeglich", details: `Nur berechnete Abrechnungen können zur Prüfung eingereicht werden. Aktueller Status: ${settlement.status}` });
        }
        updateData = {
          status: "PENDING_REVIEW",
          reviewNotes: notes ?? null,
        };
        break;
      }

      case "approve": {
        // approve: status must be PENDING_REVIEW -> APPROVED
        if (settlement.status !== "PENDING_REVIEW") {
          return apiError("BAD_REQUEST", undefined, { message: "Freigabe nicht moeglich", details: `Nur Abrechnungen im Status 'Zur Prüfung' können freigegeben werden. Aktueller Status: ${settlement.status}` });
        }

        // Require different user than creator (four-eyes principle)
        if (settlement.createdById && settlement.createdById === check.userId) {
          return apiError("FORBIDDEN", undefined, { message: "Freigabe nicht moeglich", details: "Die Freigabe muss durch eine andere Person als den Ersteller erfolgen (Vier-Augen-Prinzip)" });
        }

        updateData = {
          status: "APPROVED",
          reviewedById: check.userId,
          reviewedAt: new Date(),
          reviewNotes: notes ?? settlement.reviewNotes,
        };
        break;
      }

      case "reject": {
        // reject: status must be PENDING_REVIEW -> CALCULATED (back to previous state)
        if (settlement.status !== "PENDING_REVIEW") {
          return apiError("BAD_REQUEST", undefined, { message: "Ablehnung nicht moeglich", details: `Nur Abrechnungen im Status 'Zur Prüfung' können abgelehnt werden. Aktueller Status: ${settlement.status}` });
        }

        if (!notes) {
          return apiError("VALIDATION_FAILED", undefined, { message: "Validierungsfehler", details: "Bei Ablehnung muss ein Grund angegeben werden (notes)" });
        }

        updateData = {
          status: "CALCULATED",
          reviewedById: check.userId,
          reviewedAt: new Date(),
          reviewNotes: notes,
        };
        break;
      }
    }

    const updated = await prisma.leaseRevenueSettlement.update({
      where: { id },
      data: updateData,
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(
      {
        settlementId: id,
        action,
        previousStatus: settlement.status,
        newStatus: updated.status,
        userId: check.userId,
      },
      `Settlement review action: ${action}`
    );

    return NextResponse.json({
      settlement: serializePrisma(updated),
    });
  } catch (error) {
    return handleApiError(error, "Fehler bei der Prüfungs-Aktion");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

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
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updateData: any = {};

    switch (action) {
      case "submit": {
        // submit: status must be CALCULATED -> PENDING_REVIEW
        if (settlement.status !== "CALCULATED") {
          return NextResponse.json(
            {
              error: "Zur Pruefung einreichen nicht moeglich",
              details: `Nur berechnete Abrechnungen koennen zur Pruefung eingereicht werden. Aktueller Status: ${settlement.status}`,
            },
            { status: 400 }
          );
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
          return NextResponse.json(
            {
              error: "Freigabe nicht moeglich",
              details: `Nur Abrechnungen im Status 'Zur Pruefung' koennen freigegeben werden. Aktueller Status: ${settlement.status}`,
            },
            { status: 400 }
          );
        }

        // Require different user than creator (four-eyes principle)
        if (settlement.createdById && settlement.createdById === check.userId) {
          return NextResponse.json(
            {
              error: "Freigabe nicht moeglich",
              details: "Die Freigabe muss durch eine andere Person als den Ersteller erfolgen (Vier-Augen-Prinzip)",
            },
            { status: 403 }
          );
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
          return NextResponse.json(
            {
              error: "Ablehnung nicht moeglich",
              details: `Nur Abrechnungen im Status 'Zur Pruefung' koennen abgelehnt werden. Aktueller Status: ${settlement.status}`,
            },
            { status: 400 }
          );
        }

        if (!notes) {
          return NextResponse.json(
            {
              error: "Validierungsfehler",
              details: "Bei Ablehnung muss ein Grund angegeben werden (notes)",
            },
            { status: 400 }
          );
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error(
      { err: error },
      "Error processing settlement review action"
    );
    return NextResponse.json(
      { error: "Fehler bei der Pruefungs-Aktion" },
      { status: 500 }
    );
  }
}

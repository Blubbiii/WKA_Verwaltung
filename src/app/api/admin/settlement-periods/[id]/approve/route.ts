import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

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
      return NextResponse.json(
        { error: "Abrechnungsperiode nicht gefunden" },
        { status: 404 }
      );
    }

    if (period.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Only periods in PENDING_REVIEW can be approved or rejected
    if (period.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        {
          error: `Nur Perioden im Status "Zur Prüfung" können genehmigt oder abgelehnt werden. Aktueller Status: ${period.status}`,
        },
        { status: 400 }
      );
    }

    // Prevent self-approval: the creator cannot approve their own settlement
    if (period.createdById === check.userId) {
      return NextResponse.json(
        {
          error:
            "Sie können Ihre eigenen Abrechnungsperioden nicht selbst genehmigen. Ein anderer Administrator muss die Prüfung durchfuehren.",
        },
        { status: 403 }
      );
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

      return NextResponse.json({
        ...updated,
        message: "Abrechnungsperiode genehmigt",
      });
    } else {
      // Reject: set back to IN_PROGRESS with rejection notes
      if (!notes || notes.trim().length === 0) {
        return NextResponse.json(
          {
            error:
              "Bei einer Ablehnung muss eine Begruendung angegeben werden",
          },
          { status: 400 }
        );
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error processing settlement approval");
    return NextResponse.json(
      { error: "Fehler bei der Genehmigung der Abrechnungsperiode" },
      { status: 500 }
    );
  }
}

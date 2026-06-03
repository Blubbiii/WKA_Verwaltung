import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  assertFourEyes,
  FourEyesViolationError,
} from "@/lib/auth/four-eyes-check";
import { findOrCreateApprovalRequest } from "@/lib/approvals/manager";

const patchSepaSchema = z.object({
  status: z.enum(["APPROVED", "EXPORTED", "CANCELLED"]),
});

// GET /api/buchhaltung/sepa/[id] — Get batch details or download XML
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");

    const batch = await prisma.sepaPaymentBatch.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        items: {
          include: {
            invoice: { select: { id: true, invoiceNumber: true, recipientName: true } },
          },
        },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!batch) {
      return apiError("NOT_FOUND", 404, { message: "SEPA-Batch nicht gefunden" });
    }

    // Download XML
    if (format === "xml" && batch.xmlContent) {
      return new NextResponse(batch.xmlContent, {
        headers: {
          "Content-Type": "application/xml",
          "Content-Disposition": `attachment; filename="${batch.batchNumber}.xml"`,
        },
      });
    }

    return NextResponse.json({ data: batch });
  } catch (error) {
    logger.error({ err: error }, "Error fetching SEPA batch");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}

// PATCH /api/buchhaltung/sepa/[id] — Update status (approve/cancel)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const parsed = patchSepaSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { status } = parsed.data;

    const batch = await prisma.sepaPaymentBatch.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!batch) {
      return apiError("NOT_FOUND", 404, { message: "SEPA-Batch nicht gefunden" });
    }

    // Sprint 3 Permissions v2: 4-Augen-Pflicht beim Übergang DRAFT → APPROVED.
    // Cancel + Exported brauchen keine zusätzliche Approval.
    if (status === "APPROVED") {
      try {
        await assertFourEyes({
          tenantId: check.tenantId!,
          userId: check.userId!,
          action: "SEPA_RUN",
          createdById: batch.createdById,
          amountEur: Number(batch.totalAmount),
        });
      } catch (err) {
        if (err instanceof FourEyesViolationError) {
          // H-7: Status UND ApprovalRequest in 1 TX. Batch wandert nach
          // PENDING_APPROVAL → UI/Reports zeigen den blockierten Zustand,
          // statt fälschlich noch DRAFT zu zeigen.
          const { approvalRequest } = await prisma.$transaction(async (tx) => {
            await tx.sepaPaymentBatch.update({
              where: { id, tenantId: check.tenantId! },
              data: { status: "PENDING_APPROVAL" },
            });
            const approvalRequest = await findOrCreateApprovalRequest(
              {
                tenantId: check.tenantId!,
                action: "SEPA_RUN",
                entityType: "SepaPaymentBatch",
                entityId: id,
                amountEur: Number(batch.totalAmount),
                requestedById: check.userId!,
                requestReason: `SEPA-Lauf ${batch.batchNumber} freigeben`,
              },
              tx,
            );
            return { approvalRequest };
          });
          return NextResponse.json(
            {
              status: "PENDING_APPROVAL",
              message:
                "Vier-Augen-Prinzip: SEPA-Lauf muss von zweitem User freigegeben werden.",
              approvalRequest: {
                id: approvalRequest.id,
                expiresAt: approvalRequest.expiresAt.toISOString(),
                threshold: err.threshold,
                amountEur: err.amountEur,
              },
            },
            { status: 202 },
          );
        }
        throw err;
      }
    }

    // H-7: Wenn der User den Batch storniert während ein PENDING-Approval
    // existiert → Approval ebenfalls invalidieren (sonst Geister-Approvals).
    // Wir nutzen REJECTED (kein CANCELLED-Status im ApprovalStatus-Enum).
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.sepaPaymentBatch.update({
        where: { id, tenantId: check.tenantId! },
        data: { status },
      });
      if (status === "CANCELLED") {
        await tx.approvalRequest.updateMany({
          where: {
            tenantId: check.tenantId!,
            entityType: "SepaPaymentBatch",
            entityId: id,
            status: "PENDING",
          },
          data: {
            status: "REJECTED",
            decidedById: check.userId!,
            decidedAt: new Date(),
            decisionReason: "SEPA-Batch storniert — Approval automatisch zurückgewiesen.",
          },
        });
      }
      return u;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error({ err: error }, "Error updating SEPA batch");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}

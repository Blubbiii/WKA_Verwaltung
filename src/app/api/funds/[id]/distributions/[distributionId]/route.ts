import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/funds/[id]/distributions/[distributionId] - Einzelne Ausschuettung laden
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; distributionId: string }> }
) {
  try {
    const check = await requirePermission("funds:read");
    if (!check.authorized) return check.error;

    const { id, distributionId } = await params;

    const distribution = await prisma.distribution.findFirst({
      where: {
        id: distributionId,
        fundId: id,
        tenantId: check.tenantId!,
      },
      include: {
        fund: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            shareholder: {
              include: {
                person: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                    personType: true,
                    email: true,
                    street: true,
                    postalCode: true,
                    city: true,
                    bankIban: true,
                    bankBic: true,
                    bankName: true,
                  },
                },
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
                grossAmount: true,
                pdfUrl: true,
              },
            },
          },
          orderBy: { amount: "desc" },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!distribution) {
      return apiError("NOT_FOUND", undefined, { message: "Ausschuettung nicht gefunden" });
    }

    return NextResponse.json(distribution);
  } catch (error) {
    logger.error({ err: error }, "Error fetching distribution");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Ausschuettung" });
  }
}

// DELETE /api/funds/[id]/distributions/[distributionId] - Ausschuettung löschen (nur DRAFT)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; distributionId: string }> }
) {
  try {
    const check = await requirePermission("invoices:delete");
    if (!check.authorized) return check.error;

    const { id, distributionId } = await params;

    const distribution = await prisma.distribution.findFirst({
      where: {
        id: distributionId,
        fundId: id,
        tenantId: check.tenantId!,
      },
    });

    if (!distribution) {
      return apiError("NOT_FOUND", undefined, { message: "Ausschuettung nicht gefunden" });
    }

    if (distribution.status !== "DRAFT") {
      return apiError("BAD_REQUEST", undefined, { message: "Nur Entwuerfe können gelöscht werden" });
    }

    await prisma.distribution.delete({
      where: { id: distributionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting distribution");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Ausschuettung" });
  }
}

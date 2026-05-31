import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/portal/my-distributions - Get all distributions for the current user
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }

    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return apiError("FORBIDDEN", 401, { message: "Mandant nicht gesetzt" });
    }

    // Find the shareholder linked to this user (tenant-scoped via fund)
    // Shareholder hat kein direktes tenantId — Filter über fund.tenantId.
    const shareholder = await prisma.shareholder.findFirst({
      where: { userId: session.user.id, fund: { tenantId } },
    });

    if (!shareholder) {
      return NextResponse.json({
        data: [],
        summary: { totalDistributed: 0, totalPending: 0, distributionCount: 0 },
      });
    }

    // Find all shareholders for the same person — STRICTLY within this tenant
    // (a Person can theoretically exist across tenants; never leak others)
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
        fund: { tenantId },
      },
      select: { id: true },
    });

    const shareholderIds = shareholders.map((sh) => sh.id);

    if (shareholderIds.length === 0) {
      return NextResponse.json({
        data: [],
        summary: { totalDistributed: 0, totalPending: 0, distributionCount: 0 },
      });
    }

    // Find all invoices (credit notes = Gutschriften = distributions) for these shareholders
    const distributions = await prisma.invoice.findMany({
      where: {
        tenantId,
        shareholderId: { in: shareholderIds },
        invoiceType: "CREDIT_NOTE",
        status: { not: "CANCELLED" },
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
          },
        },
        shareholder: {
          select: {
            id: true,
            shareholderNumber: true,
          },
        },
      },
      orderBy: { invoiceDate: "desc" },
    });

    // Calculate totals
    const paidDistributions = distributions.filter((d) => d.status === "PAID");
    const pendingDistributions = distributions.filter((d) => d.status === "SENT");

    const totalDistributed = paidDistributions.reduce(
      (sum, d) => sum + d.grossAmount.toNumber(),
      0
    );

    const totalPending = pendingDistributions.reduce(
      (sum, d) => sum + d.grossAmount.toNumber(),
      0
    );

    return NextResponse.json({
      data: distributions.map((d) => ({
        id: d.id,
        invoiceNumber: d.invoiceNumber,
        invoiceDate: d.invoiceDate.toISOString(),
        netAmount: d.netAmount.toNumber(),
        taxAmount: d.taxAmount?.toNumber() || 0,
        grossAmount: d.grossAmount.toNumber(),
        status: d.status,
        description: d.notes,
        fund: d.fund,
        shareholderNumber: d.shareholder?.shareholderNumber,
      })),
      summary: {
        totalDistributed,
        totalPending,
        distributionCount: distributions.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching distributions");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}

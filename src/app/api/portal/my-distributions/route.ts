import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/portal/my-distributions - Get all distributions for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
    });

    if (!shareholder) {
      return NextResponse.json({
        data: [],
        summary: { totalDistributed: 0, totalPending: 0, distributionCount: 0 },
      });
    }

    // Find all shareholders for the same person
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
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
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// POST /api/funds/[id]/recalculate
// Recalculates all shareholder ownership percentages for a fund
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.FUNDS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id: fundId } = await params;

    // Verify fund belongs to tenant
    const fund = await prisma.fund.findFirst({
      where: {
        id: fundId,
        tenantId: check.tenantId,
      },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    // Get all active shareholders in this fund
    const shareholders = await prisma.shareholder.findMany({
      where: {
        fundId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        capitalContribution: true,
      },
    });

    // Calculate total capital
    const totalCapital = shareholders.reduce(
      (sum, sh) => sum + (Number(sh.capitalContribution) || 0),
      0
    );

    // Update each shareholder's ownership percentage
    if (totalCapital > 0) {
      for (const sh of shareholders) {
        const contribution = Number(sh.capitalContribution) || 0;
        const percentage = (contribution / totalCapital) * 100;
        const roundedPercentage = Math.round(percentage * 100) / 100;

        await prisma.shareholder.update({
          where: { id: sh.id },
          data: {
            ownershipPercentage: roundedPercentage,
            votingRightsPercentage: roundedPercentage,
            distributionPercentage: roundedPercentage,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalCapital,
      shareholdersUpdated: shareholders.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error recalculating fund shares");
    return NextResponse.json(
      { error: "Fehler bei der Neuberechnung" },
      { status: 500 }
    );
  }
}

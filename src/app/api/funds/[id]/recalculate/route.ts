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

    // Atomic recalculation: read + update all shareholders in single transaction
    const result = await prisma.$transaction(async (tx) => {
      const shareholders = await tx.shareholder.findMany({
        where: {
          fundId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          capitalContribution: true,
        },
      });

      const totalCapital = shareholders.reduce(
        (sum, sh) => sum + (Number(sh.capitalContribution) || 0),
        0
      );

      if (totalCapital > 0) {
        await Promise.all(
          shareholders.map((sh) => {
            const contribution = Number(sh.capitalContribution) || 0;
            const percentage = (contribution / totalCapital) * 100;
            const roundedPercentage = Math.round(percentage * 100) / 100;

            return tx.shareholder.update({
              where: { id: sh.id },
              data: {
                ownershipPercentage: roundedPercentage,
                votingRightsPercentage: roundedPercentage,
                distributionPercentage: roundedPercentage,
              },
            });
          })
        );
      }

      return { totalCapital, shareholdersUpdated: shareholders.length };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error({ err: error }, "Error recalculating fund shares");
    return NextResponse.json(
      { error: "Fehler bei der Neuberechnung" },
      { status: 500 }
    );
  }
}

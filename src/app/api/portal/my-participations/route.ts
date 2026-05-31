import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/portal/my-participations - Get all participations for the current user
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
      include: {
        person: true,
      },
    });

    if (!shareholder) {
      return NextResponse.json({
        data: [],
        summary: { totalParticipations: 0, totalInvestment: 0, totalShares: 0 },
        message: "Kein Gesellschafterprofil verknüpft"
      });
    }

    // Find all shareholders for the same person — STRICT tenant-scope via fund
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
        fund: { tenantId },
        status: { not: "ARCHIVED" },
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            status: true,
            totalCapital: true,
            fundParks: {
              select: {
                park: {
                  select: {
                    id: true,
                    name: true,
                    shortName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Calculate totals
    const totalInvestment = shareholders.reduce(
      (sum, sh) => sum + (sh.capitalContribution?.toNumber() || 0),
      0
    );

    const totalShares = shareholders.reduce(
      (sum, sh) => sum + (sh.ownershipPercentage?.toNumber() || 0),
      0
    );

    return NextResponse.json({
      data: shareholders.map((sh) => ({
        id: sh.id,
        shareholderNumber: sh.shareholderNumber,
        capitalContribution: sh.capitalContribution?.toNumber() || 0,
        sharePercentage: sh.ownershipPercentage?.toNumber() || 0,
        joinDate: sh.entryDate?.toISOString() || null,
        status: sh.status,
        fund: {
          ...sh.fund,
          totalCapital: sh.fund.totalCapital?.toNumber() || null,
          parks: sh.fund.fundParks.map((fp) => fp.park),
        },
      })),
      summary: {
        totalParticipations: shareholders.length,
        totalInvestment,
        totalShares,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching participations");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}

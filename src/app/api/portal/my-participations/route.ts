import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/portal/my-participations - Get all participations for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Find the shareholder linked to this user (one-to-one relation)
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
      include: {
        person: true,
      },
    });

    if (!shareholder) {
      // Try to find shareholders by looking at the person the user might be linked to
      // For now, return empty if no direct shareholder link
      return NextResponse.json({
        data: [],
        summary: { totalParticipations: 0, totalInvestment: 0, totalShares: 0 },
        message: "Kein Gesellschafterprofil verknüpft"
      });
    }

    // Find all shareholders for the same person (user might have multiple fund participations)
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
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
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

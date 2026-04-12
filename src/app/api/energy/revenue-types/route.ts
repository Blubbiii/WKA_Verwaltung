import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/energy/revenue-types - Alle Vergütungsarten
export async function GET() {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const revenueTypes = await prisma.energyRevenueType.findMany({
      where: {
        tenantId: check.tenantId!,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        calculationType: true,
        hasTax: true,
        taxRate: true,
      },
    });

    return NextResponse.json({ data: revenueTypes });
  } catch (error) {
    logger.error({ err: error }, "Error fetching revenue types");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Vergütungsarten" });
  }
}

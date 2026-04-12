import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/portal/energy-reports
// List portal-visible energy report configs for the authenticated user's tenant.
// Checks if "energyReports" is enabled in the tenant's portalVisibleSections.
// =============================================================================

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }

    const tenantId = session.user.tenantId;

    if (!tenantId) {
      return apiError("FORBIDDEN", undefined, { message: "Kein Mandant zugeordnet" });
    }

    // Fetch tenant settings to check if energyReports section is enabled
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
    }

    // Check if energyReports is in portalVisibleSections
    const settings = tenant.settings as Record<string, unknown> | null;
    const portalVisibleSections = (settings?.portalVisibleSections as string[]) ?? [];

    if (!portalVisibleSections.includes("energyReports")) {
      return NextResponse.json({
        data: [],
        message: "Energieberichte sind im Portal nicht aktiviert",
      });
    }

    // Fetch only portal-visible configs for this tenant
    const configs = await prisma.energyReportConfig.findMany({
      where: {
        tenantId,
        portalVisible: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        modules: true,
        parkId: true,
        turbineId: true,
        interval: true,
        portalLabel: true,
        park: {
          select: { id: true, name: true },
        },
        turbine: {
          select: { id: true, designation: true },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    });

    // Map portalLabel as the display name if set
    const data = configs.map((config) => ({
      ...config,
      displayName: config.portalLabel || config.name,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    logger.error({ err: error }, "Error fetching portal energy report configs");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}

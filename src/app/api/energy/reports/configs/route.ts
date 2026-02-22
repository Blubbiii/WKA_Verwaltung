import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALID MODULES for energy report configurations
// =============================================================================

const VALID_MODULES = [
  // Classic modules
  "production",
  "powerCurve",
  "windRose",
  "dailyProfile",
  "windDistribution",
  "kpiSummary",
  "turbineComparison",
  // Analytics modules
  "performanceKpis",
  "productionHeatmap",
  "turbineRanking",
  "yearOverYear",
  "availabilityBreakdown",
  "availabilityTrend",
  "availabilityHeatmap",
  "downtimePareto",
  "powerCurveOverlay",
  "faultPareto",
  "warningTrend",
  "environmentalData",
  "financialOverview",
  "revenueComparison",
] as const;

const VALID_INTERVALS = ["10min", "hour", "day", "month", "year"] as const;

// =============================================================================
// Zod validation schema for creating a new config
// =============================================================================

const CreateConfigSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  description: z.string().max(2000).optional().nullable(),
  modules: z
    .array(z.enum(VALID_MODULES))
    .min(1, "Mindestens ein Modul muss ausgewaehlt werden"),
  parkId: z.string().uuid().optional().nullable(),
  turbineId: z.string().uuid().optional().nullable(),
  interval: z.enum(VALID_INTERVALS).optional().default("month"),
  portalVisible: z.boolean().optional().default(false),
  portalLabel: z.string().max(200).optional().nullable(),
  isTemplate: z.boolean().optional().default(false),
});

// =============================================================================
// GET /api/energy/reports/configs
// List all energy report configurations for the current tenant.
// Optional query param: ?portalOnly=true to filter portal-visible configs only.
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    const { searchParams } = new URL(request.url);
    const portalOnly = searchParams.get("portalOnly") === "true";

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = { tenantId };
    if (portalOnly) {
      where.portalVisible = true;
    }

    const configs = await prisma.energyReportConfig.findMany({
      where,
      include: {
        park: {
          select: { id: true, name: true },
        },
        turbine: {
          select: { id: true, designation: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: configs });
  } catch (error) {
    logger.error({ err: error }, "Error fetching energy report configs");
    return NextResponse.json(
      { error: "Fehler beim Laden der Berichts-Konfigurationen" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/energy/reports/configs
// Create a new energy report configuration.
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const userId = check.userId!;

    const body = await request.json();
    const parsed = CreateConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungueltige Eingabedaten",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Validate parkId belongs to tenant if provided
    if (data.parkId) {
      const park = await prisma.park.findFirst({
        where: { id: data.parkId, tenantId },
      });
      if (!park) {
        return NextResponse.json(
          { error: "Windpark nicht gefunden oder nicht zugehoerig" },
          { status: 404 }
        );
      }
    }

    // Validate turbineId belongs to tenant if provided
    if (data.turbineId) {
      const turbine = await prisma.turbine.findFirst({
        where: {
          id: data.turbineId,
          park: { tenantId },
        },
      });
      if (!turbine) {
        return NextResponse.json(
          { error: "Turbine nicht gefunden oder nicht zugehoerig" },
          { status: 404 }
        );
      }
    }

    const config = await prisma.energyReportConfig.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        modules: data.modules,
        parkId: data.parkId ?? null,
        turbineId: data.turbineId ?? null,
        interval: data.interval,
        portalVisible: data.portalVisible,
        portalLabel: data.portalLabel ?? null,
        isTemplate: data.isTemplate,
        tenantId,
        createdById: userId,
      },
      include: {
        park: {
          select: { id: true, name: true },
        },
        turbine: {
          select: { id: true, designation: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json({ data: config }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating energy report config");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Berichts-Konfiguration" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

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
  parkId: z.uuid().optional().nullable(),
  turbineId: z.uuid().optional().nullable(),
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
    const where: Prisma.EnergyReportConfigWhereInput = { tenantId };
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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Berichts-Konfigurationen" });
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
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabedaten", details: parsed.error.flatten().fieldErrors });
    }

    const data = parsed.data;

    // Validate parkId belongs to tenant if provided
    if (data.parkId) {
      const park = await prisma.park.findFirst({
        where: { id: data.parkId, tenantId },
      });
      if (!park) {
        return apiError("NOT_FOUND", undefined, { message: "Windpark nicht gefunden oder nicht zugehoerig" });
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
        return apiError("NOT_FOUND", undefined, { message: "Turbine nicht gefunden oder nicht zugehoerig" });
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
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen der Berichts-Konfiguration" });
  }
}

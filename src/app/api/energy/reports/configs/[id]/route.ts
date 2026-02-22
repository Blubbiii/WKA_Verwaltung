import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALID MODULES and INTERVALS (shared constants)
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
// Zod validation schema for updating a config
// =============================================================================

const UpdateConfigSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  modules: z.array(z.enum(VALID_MODULES)).min(1).optional(),
  parkId: z.string().uuid().optional().nullable(),
  turbineId: z.string().uuid().optional().nullable(),
  interval: z.enum(VALID_INTERVALS).optional(),
  portalVisible: z.boolean().optional(),
  portalLabel: z.string().max(200).optional().nullable(),
  isTemplate: z.boolean().optional(),
});

// =============================================================================
// GET /api/energy/reports/configs/[id]
// Get a single energy report configuration by ID.
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { id } = await params;

    const config = await prisma.energyReportConfig.findFirst({
      where: { id, tenantId },
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

    if (!config) {
      return NextResponse.json(
        { error: "Berichts-Konfiguration nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: config });
  } catch (error) {
    logger.error({ err: error }, "Error fetching energy report config");
    return NextResponse.json(
      { error: "Fehler beim Laden der Berichts-Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/energy/reports/configs/[id]
// Update an existing energy report configuration.
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { id } = await params;

    // Verify config exists and belongs to tenant
    const existing = await prisma.energyReportConfig.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Berichts-Konfiguration nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = UpdateConfigSchema.safeParse(body);

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

    // Build update payload - only include fields that were provided
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.modules !== undefined) updateData.modules = data.modules;
    if (data.parkId !== undefined) updateData.parkId = data.parkId;
    if (data.turbineId !== undefined) updateData.turbineId = data.turbineId;
    if (data.interval !== undefined) updateData.interval = data.interval;
    if (data.portalVisible !== undefined) updateData.portalVisible = data.portalVisible;
    if (data.portalLabel !== undefined) updateData.portalLabel = data.portalLabel;
    if (data.isTemplate !== undefined) updateData.isTemplate = data.isTemplate;

    const config = await prisma.energyReportConfig.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({ data: config });
  } catch (error) {
    logger.error({ err: error }, "Error updating energy report config");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Berichts-Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/energy/reports/configs/[id]
// Delete an energy report configuration.
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { id } = await params;

    // Verify config exists and belongs to tenant
    const existing = await prisma.energyReportConfig.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Berichts-Konfiguration nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.energyReportConfig.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting energy report config");
    return NextResponse.json(
      { error: "Fehler beim Loeschen der Berichts-Konfiguration" },
      { status: 500 }
    );
  }
}

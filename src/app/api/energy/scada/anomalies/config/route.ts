import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const putAnomalyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  performanceThreshold: z.number().min(1).max(100).optional(),
  availabilityThreshold: z.number().min(1).max(100).optional(),
  downtimeHoursThreshold: z.number().min(1).max(720).optional(),
  curveDeviationThreshold: z.number().min(1).max(100).optional(),
  dataQualityThreshold: z.number().min(1).max(100).optional(),
  notifyByEmail: z.boolean().optional(),
  notifyInApp: z.boolean().optional(),
});

// =============================================================================
// GET /api/energy/scada/anomalies/config - Get anomaly detection config
// =============================================================================

export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    const config = await prisma.scadaAnomalyConfig.findUnique({
      where: { tenantId },
    });

    // Return config or defaults
    if (!config) {
      return NextResponse.json({
        config: {
          enabled: true,
          performanceThreshold: 15,
          availabilityThreshold: 90,
          downtimeHoursThreshold: 24,
          curveDeviationThreshold: 20,
          dataQualityThreshold: 80,
          notifyByEmail: true,
          notifyInApp: true,
        },
        isDefault: true,
      });
    }

    return NextResponse.json({
      config: {
        id: config.id,
        enabled: config.enabled,
        performanceThreshold: Number(config.performanceThreshold),
        availabilityThreshold: Number(config.availabilityThreshold),
        downtimeHoursThreshold: config.downtimeHoursThreshold,
        curveDeviationThreshold: Number(config.curveDeviationThreshold),
        dataQualityThreshold: Number(config.dataQualityThreshold),
        notifyByEmail: config.notifyByEmail,
        notifyInApp: config.notifyInApp,
      },
      isDefault: false,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Anomalie-Konfiguration");
    return NextResponse.json(
      { error: "Fehler beim Laden der Anomalie-Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/energy/scada/anomalies/config - Update anomaly detection config
// =============================================================================

export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("energy:update");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const body = await request.json();
    const parsed = putAnomalyConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      enabled,
      performanceThreshold,
      availabilityThreshold,
      downtimeHoursThreshold,
      curveDeviationThreshold,
      dataQualityThreshold,
      notifyByEmail,
      notifyInApp,
    } = parsed.data;

    // Build update data - only include provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};

    if (typeof enabled === "boolean") data.enabled = enabled;
    if (performanceThreshold !== undefined)
      data.performanceThreshold = performanceThreshold;
    if (availabilityThreshold !== undefined)
      data.availabilityThreshold = availabilityThreshold;
    if (downtimeHoursThreshold !== undefined)
      data.downtimeHoursThreshold = downtimeHoursThreshold;
    if (curveDeviationThreshold !== undefined)
      data.curveDeviationThreshold = curveDeviationThreshold;
    if (dataQualityThreshold !== undefined)
      data.dataQualityThreshold = dataQualityThreshold;
    if (typeof notifyByEmail === "boolean") data.notifyByEmail = notifyByEmail;
    if (typeof notifyInApp === "boolean") data.notifyInApp = notifyInApp;

    // Upsert: create if not exists, update if exists
    const config = await prisma.scadaAnomalyConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...data,
      },
      update: data,
    });

    return NextResponse.json({
      config: {
        id: config.id,
        enabled: config.enabled,
        performanceThreshold: Number(config.performanceThreshold),
        availabilityThreshold: Number(config.availabilityThreshold),
        downtimeHoursThreshold: config.downtimeHoursThreshold,
        curveDeviationThreshold: Number(config.curveDeviationThreshold),
        dataQualityThreshold: Number(config.dataQualityThreshold),
        notifyByEmail: config.notifyByEmail,
        notifyInApp: config.notifyInApp,
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Fehler beim Speichern der Anomalie-Konfiguration"
    );
    return NextResponse.json(
      { error: "Fehler beim Speichern der Anomalie-Konfiguration" },
      { status: 500 }
    );
  }
}

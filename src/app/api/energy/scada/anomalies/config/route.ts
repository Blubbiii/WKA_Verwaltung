import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/anomalies/config - Get anomaly detection config
// =============================================================================

export async function GET(request: NextRequest) {
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

    const {
      enabled,
      performanceThreshold,
      availabilityThreshold,
      downtimeHoursThreshold,
      curveDeviationThreshold,
      dataQualityThreshold,
      notifyByEmail,
      notifyInApp,
    } = body;

    // Validate thresholds
    if (performanceThreshold !== undefined) {
      const val = Number(performanceThreshold);
      if (isNaN(val) || val < 1 || val > 100) {
        return NextResponse.json(
          { error: "performanceThreshold muss zwischen 1 und 100 liegen" },
          { status: 400 }
        );
      }
    }

    if (availabilityThreshold !== undefined) {
      const val = Number(availabilityThreshold);
      if (isNaN(val) || val < 1 || val > 100) {
        return NextResponse.json(
          { error: "availabilityThreshold muss zwischen 1 und 100 liegen" },
          { status: 400 }
        );
      }
    }

    if (downtimeHoursThreshold !== undefined) {
      const val = Number(downtimeHoursThreshold);
      if (isNaN(val) || val < 1 || val > 720) {
        return NextResponse.json(
          { error: "downtimeHoursThreshold muss zwischen 1 und 720 liegen" },
          { status: 400 }
        );
      }
    }

    if (curveDeviationThreshold !== undefined) {
      const val = Number(curveDeviationThreshold);
      if (isNaN(val) || val < 1 || val > 100) {
        return NextResponse.json(
          { error: "curveDeviationThreshold muss zwischen 1 und 100 liegen" },
          { status: 400 }
        );
      }
    }

    if (dataQualityThreshold !== undefined) {
      const val = Number(dataQualityThreshold);
      if (isNaN(val) || val < 1 || val > 100) {
        return NextResponse.json(
          { error: "dataQualityThreshold muss zwischen 1 und 100 liegen" },
          { status: 400 }
        );
      }
    }

    // Build update data - only include provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};

    if (typeof enabled === "boolean") data.enabled = enabled;
    if (performanceThreshold !== undefined)
      data.performanceThreshold = Number(performanceThreshold);
    if (availabilityThreshold !== undefined)
      data.availabilityThreshold = Number(availabilityThreshold);
    if (downtimeHoursThreshold !== undefined)
      data.downtimeHoursThreshold = Number(downtimeHoursThreshold);
    if (curveDeviationThreshold !== undefined)
      data.curveDeviationThreshold = Number(curveDeviationThreshold);
    if (dataQualityThreshold !== undefined)
      data.dataQualityThreshold = Number(dataQualityThreshold);
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

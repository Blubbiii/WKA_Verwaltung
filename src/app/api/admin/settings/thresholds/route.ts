import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import {
  AVAILABILITY_WARNING_THRESHOLD,
  AVAILABILITY_CRITICAL_THRESHOLD,
  CONTRACT_WARNING_DAYS,
  CONTRACT_URGENT_DAYS,
  CONTRACT_CALENDAR_LOOKAHEAD_DAYS,
  PARK_HEALTH_LOOKBACK_DAYS,
} from "@/lib/config/business-thresholds";

export interface ThresholdSettings {
  availabilityWarning: number;
  availabilityCritical: number;
  contractWarningDays: number;
  contractUrgentDays: number;
  contractLookaheadDays: number;
  parkHealthLookbackDays: number;
}

const DEFAULT_THRESHOLDS: ThresholdSettings = {
  availabilityWarning: AVAILABILITY_WARNING_THRESHOLD,
  availabilityCritical: AVAILABILITY_CRITICAL_THRESHOLD,
  contractWarningDays: CONTRACT_WARNING_DAYS,
  contractUrgentDays: CONTRACT_URGENT_DAYS,
  contractLookaheadDays: CONTRACT_CALENDAR_LOOKAHEAD_DAYS,
  parkHealthLookbackDays: PARK_HEALTH_LOOKBACK_DAYS,
};

// GET /api/admin/settings/thresholds
export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    if (check.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { settings: true },
      });

      if (tenant?.settings && typeof tenant.settings === "object") {
        const s = tenant.settings as Record<string, unknown>;
        if (s.thresholds) {
          return NextResponse.json({
            ...DEFAULT_THRESHOLDS,
            ...(s.thresholds as object),
          });
        }
      }
    }

    return NextResponse.json(DEFAULT_THRESHOLDS);
  } catch (error) {
    logger.error({ err: error }, "Error fetching threshold settings");
    return NextResponse.json(
      { error: "Fehler beim Laden der Schwellenwerte" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/settings/thresholds
export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();

    const aw = Number(body.availabilityWarning);
    const ac = Number(body.availabilityCritical);
    const cw = Number(body.contractWarningDays);
    const cu = Number(body.contractUrgentDays);
    const cl = Number(body.contractLookaheadDays);
    const ph = Number(body.parkHealthLookbackDays);

    // Validate availability thresholds
    if (
      isNaN(aw) || aw < 0 || aw > 100 ||
      isNaN(ac) || ac < 0 || ac > 100 ||
      ac >= aw
    ) {
      return NextResponse.json(
        { error: "Verfügbarkeitsschwellen ungültig (0–100, kritisch < Warnung)" },
        { status: 400 }
      );
    }

    // Validate contract days
    if (
      isNaN(cw) || cw < 1 || cw > 365 ||
      isNaN(cu) || cu < 1 || cu > cw ||
      isNaN(cl) || cl < 1 || cl > 730
    ) {
      return NextResponse.json(
        { error: "Vertragsschwellen ungültig (Dringend muss kleiner als Warnung sein)" },
        { status: 400 }
      );
    }

    // Validate park health lookback
    if (isNaN(ph) || ph < 1 || ph > 90) {
      return NextResponse.json(
        { error: "Park-Health-Zeitfenster muss zwischen 1 und 90 Tagen liegen" },
        { status: 400 }
      );
    }

    const thresholds: ThresholdSettings = {
      availabilityWarning: aw,
      availabilityCritical: ac,
      contractWarningDays: cw,
      contractUrgentDays: cu,
      contractLookaheadDays: cl,
      parkHealthLookbackDays: ph,
    };

    if (check.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { settings: true },
      });

      const existing = (tenant?.settings as Record<string, unknown>) ?? {};

      await prisma.tenant.update({
        where: { id: check.tenantId },
        data: {
          settings: JSON.parse(JSON.stringify({ ...existing, thresholds })),
        },
      });
    }

    return NextResponse.json(thresholds);
  } catch (error) {
    logger.error({ err: error }, "Error updating threshold settings");
    return NextResponse.json(
      { error: "Fehler beim Speichern der Schwellenwerte" },
      { status: 500 }
    );
  }
}

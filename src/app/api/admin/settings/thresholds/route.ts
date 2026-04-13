import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import {
  AVAILABILITY_WARNING_THRESHOLD,
  AVAILABILITY_CRITICAL_THRESHOLD,
  CONTRACT_WARNING_DAYS,
  CONTRACT_URGENT_DAYS,
  CONTRACT_CALENDAR_LOOKAHEAD_DAYS,
  PARK_HEALTH_LOOKBACK_DAYS,
} from "@/lib/config/business-thresholds";
import { apiError } from "@/lib/api-errors";

export interface ThresholdSettings {
  availabilityWarning: number;
  availabilityCritical: number;
  contractWarningDays: number;
  contractUrgentDays: number;
  contractLookaheadDays: number;
  parkHealthLookbackDays: number;
}

const putThresholdsSchema = z.object({
  availabilityWarning: z.number().min(0).max(100),
  availabilityCritical: z.number().min(0).max(100),
  contractWarningDays: z.number().min(1).max(365),
  contractUrgentDays: z.number().min(1).max(365),
  contractLookaheadDays: z.number().min(1).max(730),
  parkHealthLookbackDays: z.number().min(1).max(90),
});

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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Schwellenwerte" });
  }
}

// PUT /api/admin/settings/thresholds
export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = putThresholdsSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }

    const { availabilityWarning: aw, availabilityCritical: ac, contractWarningDays: cw, contractUrgentDays: cu, contractLookaheadDays: cl, parkHealthLookbackDays: ph } = parsed.data;

    // Cross-field validation: critical must be less than warning
    if (ac >= aw) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Verfügbarkeitsschwellen ungültig (kritisch < Warnung)" });
    }

    // Cross-field validation: urgent must be <= warning
    if (cu > cw) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Vertragsschwellen ungültig (Dringend muss kleiner als Warnung sein)" });
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
          // structuredClone is ~2x faster than JSON.parse(JSON.stringify(...))
          settings: structuredClone({ ...existing, thresholds }),
        },
      });
    }

    return NextResponse.json(thresholds);
  } catch (error) {
    logger.error({ err: error }, "Error updating threshold settings");
    return apiError("SAVE_FAILED", undefined, { message: "Fehler beim Speichern der Schwellenwerte" });
  }
}

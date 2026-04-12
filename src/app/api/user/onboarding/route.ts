/**
 * API: User Onboarding State
 *
 * GET /api/user/onboarding  - Get onboarding/tour state
 * PUT /api/user/onboarding  - Update onboarding/tour state
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import type { UserSettings } from "@/types/dashboard";
import { DEFAULT_ONBOARDING_STATE, type OnboardingState } from "@/lib/onboarding/tour-config";

const updateSchema = z.object({
  completedTours: z.array(z.string()).optional(),
  skippedAt: z.string().optional(),
  lastTourVersion: z.number().optional(),
});

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const user = await prisma.user.findUnique({
      where: { id: check.userId },
      select: { settings: true },
    });

    const settings = (user?.settings as UserSettings) || {};
    const onboarding = (settings.onboarding as OnboardingState) || DEFAULT_ONBOARDING_STATE;

    return NextResponse.json(onboarding);
  } catch (error) {
    logger.error({ err: error }, "Error fetching onboarding state");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden des Onboarding-Status" });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Validierungsfehler" });
    }

    const user = await prisma.user.findUnique({
      where: { id: check.userId },
      select: { settings: true },
    });

    const existingSettings = (user?.settings as UserSettings) || {};
    const existingOnboarding =
      (existingSettings.onboarding as OnboardingState) || DEFAULT_ONBOARDING_STATE;

    // Merge completed tours (deduplicated)
    const mergedTours = [
      ...new Set([
        ...existingOnboarding.completedTours,
        ...(parsed.data.completedTours || []),
      ]),
    ];

    const updatedOnboarding: OnboardingState = {
      ...existingOnboarding,
      completedTours: mergedTours,
      ...(parsed.data.skippedAt && { skippedAt: parsed.data.skippedAt }),
      ...(parsed.data.lastTourVersion !== undefined && {
        lastTourVersion: parsed.data.lastTourVersion,
      }),
    };

    await prisma.user.update({
      where: { id: check.userId },
      data: {
        settings: {
          ...existingSettings,
          onboarding: updatedOnboarding,
        } as Record<string, unknown>,
      },
    });

    return NextResponse.json(updatedOnboarding);
  } catch (error) {
    logger.error({ err: error }, "Error updating onboarding state");
    return apiError("SAVE_FAILED", 500, { message: "Fehler beim Speichern des Onboarding-Status" });
  }
}

/**
 * Idee E — Daily-Digest-Preference API.
 *
 *  - GET    /api/user/digest-preference     liefert {enabled, lastSentAt}
 *  - PATCH  /api/user/digest-preference     setzt {enabled: boolean}
 *
 * Reine User-Preference, keine Permission-Checks außer requireAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;
    const user = await prisma.user.findUnique({
      where: { id: check.userId! },
      select: { dailyDigestEnabled: true, dailyDigestLastSentAt: true },
    });
    if (!user) {
      return apiError("NOT_FOUND", 404, { message: "User nicht gefunden" });
    }
    return NextResponse.json({
      enabled: user.dailyDigestEnabled,
      lastSentAt: user.dailyDigestLastSentAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err }, "[digest-preference] GET failed");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}

const patchSchema = z.object({
  enabled: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;
    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        details: parsed.error.flatten(),
      });
    }
    await prisma.user.update({
      where: { id: check.userId! },
      data: { dailyDigestEnabled: parsed.data.enabled },
    });
    return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
  } catch (err) {
    logger.error({ err }, "[digest-preference] PATCH failed");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}

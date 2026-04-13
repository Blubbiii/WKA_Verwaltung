/**
 * DSGVO Consent-Log API
 *
 * Protokolliert User-Einwilligungen in eine Audit-Tabelle (ConsentLog).
 * Wird aus dem CookieBanner aufgerufen wenn der User "Verstanden" klickt,
 * und kann theoretisch von anderen Einwilligungs-Dialogen mitgenutzt werden.
 *
 * Öffentlich erreichbar (unauthenticated Besucher müssen consenten können).
 * Rate-limited über IP um Floods zu verhindern.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { rateLimit, getClientIp, getRateLimitResponse, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";

const consentSchema = z.object({
  consentType: z.enum([
    "cookies_necessary",
    "cookies_analytics",
    "cookies_marketing",
    "privacy_policy",
  ]),
  given: z.boolean(),
  version: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(128).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limit per IP (5 consent writes / 15 min — mehr als realistisch nötig)
    const ip = getClientIp(req);
    const rl = await rateLimit(`consent:${ip}`, AUTH_RATE_LIMIT);
    if (!rl.success) return getRateLimitResponse(rl);

    const parsed = consentSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Consent-Daten",
        details: parsed.error.flatten(),
      });
    }

    const { consentType, given, version, sessionId } = parsed.data;

    // Optional: wenn der User eingeloggt ist, verknüpfe den ConsentLog
    // mit seiner userId + tenantId für nachverfolgbare Audits.
    const session = await auth().catch(() => null);
    const userId = session?.user?.id ?? null;
    const tenantId = session?.user?.tenantId || null;

    const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    await prisma.consentLog.create({
      data: {
        tenantId,
        userId,
        sessionId: sessionId ?? null,
        consentType,
        given,
        version,
        ipAddress: ip,
        userAgent,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "Error recording consent");
    return apiError("SAVE_FAILED", 500, { message: "Fehler beim Speichern der Einwilligung" });
  }
}

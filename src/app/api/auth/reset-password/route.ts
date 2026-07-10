import { NextResponse } from "next/server";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { rateLimit, getClientIp, getRateLimitResponse, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { AUTH_CONFIG } from "@/lib/config/auth-config";
import { apiError } from "@/lib/api-errors";

// Validation Schema
const resetPasswordSchema = z.object({
  token: z.string().uuid("Ungültiger Token"),
  password: z
    .string()
    .min(AUTH_CONFIG.passwordMinLength, `Passwort muss mindestens ${AUTH_CONFIG.passwordMinLength} Zeichen lang sein`)
    .regex(/[A-Z]/, "Passwort muss mindestens einen Grossbuchstaben enthalten")
    .regex(/[a-z]/, "Passwort muss mindestens einen Kleinbuchstaben enthalten")
    .regex(/[0-9]/, "Passwort muss mindestens eine Zahl enthalten")
    .regex(/[^A-Za-z0-9]/, "Passwort muss mindestens ein Sonderzeichen enthalten")
    .max(AUTH_CONFIG.passwordMaxLength, `Passwort darf maximal ${AUTH_CONFIG.passwordMaxLength} Zeichen lang sein`),
});

export async function POST(request: Request) {
  try {
    // Rate limiting: prevent brute-force token guessing
    const ip = getClientIp(request);
    const rateLimitResult = await rateLimit(`reset-password:${ip}`, AUTH_RATE_LIMIT);
    if (!rateLimitResult.success) {
      return getRateLimitResponse(rateLimitResult, AUTH_RATE_LIMIT);
    }

    const body = await request.json();

    // Validate input
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Validierungsfehler",
        details: {
          fields: parsed.error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
      });
    }

    const { token, password } = parsed.data;

    // FIX 18: Token-Prüfung + user.update + usedAt-Set in einer TX.
    // Vorher: updateMany claimed den Token BEVOR das Passwort gesetzt wurde —
    // fällt user.update aus (DB-Timeout, Constraint), ist der User locked out.
    // Jetzt: In interactiver TX prüfen, danach hashen, User updaten, ERST DANN
    // usedAt setzen. Bei Fehler rollt Prisma alles zurück.

    // Pre-fetch Token-Daten (User-Status prüfen) außerhalb TX — hier passiert
    // noch kein Mutations-Kommit, daher unkritisch.
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: {
        user: {
          select: { id: true, email: true, status: true },
        },
      },
    });

    if (!resetToken || resetToken.usedAt !== null || resetToken.expiresAt <= new Date()) {
      // Frontend reset-password/page.tsx checkt explizit auf code === "INVALID_TOKEN"
      // um eine spezielle Fehlermeldung anzuzeigen.
      return apiError("INVALID_TOKEN", 400, {
        message: "Ungültiger, bereits verwendeter oder abgelaufener Token. Bitte fordern Sie einen neuen Reset-Link an.",
      });
    }

    if (resetToken.user.status !== "ACTIVE") {
      return apiError("USER_INACTIVE", 400, {
        message: "Dieses Benutzerkonto ist nicht aktiv. Bitte kontaktieren Sie den Administrator.",
      });
    }

    // Hash new password (außerhalb TX — CPU-intensiv, blockt sonst DB-Slot).
    const passwordHash = await bcrypt.hash(password, AUTH_CONFIG.bcryptSaltRounds);

    // TX: Race-safe atomischer Claim + user.update + Peer-Token-Invalidate.
    // Atomic claim via `usedAt: null` in WHERE — schlägt parallele Requests fehl.
    try {
      await prisma.$transaction(async (tx) => {
        // 1. User-Passwort setzen (idempotent; sicher vor Token-Claim).
        await tx.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash },
        });
        // 2. Atomarer Token-Claim (verhindert Doppelnutzung des Tokens).
        const claimed = await tx.passwordResetToken.updateMany({
          where: {
            id: resetToken.id,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });
        if (claimed.count === 0) {
          // Wettlauf verloren — TX rollen (auch das user.update).
          throw new Error("TOKEN_ALREADY_CLAIMED");
        }
        // 3. Alle anderen offenen Tokens dieses Users invalidieren.
        await tx.passwordResetToken.updateMany({
          where: {
            userId: resetToken.userId,
            usedAt: null,
            id: { not: resetToken.id },
          },
          data: { usedAt: new Date() },
        });
      });
    } catch (txErr) {
      if (txErr instanceof Error && txErr.message === "TOKEN_ALREADY_CLAIMED") {
        return apiError("INVALID_TOKEN", 400, {
          message: "Token wurde bereits verwendet. Bitte fordern Sie einen neuen Reset-Link an.",
        });
      }
      throw txErr;
    }

    // Audit log: password reset completed (no sensitive data)
    logger.info(`Password reset completed for userId=${resetToken.userId} at ${new Date().toISOString()}`);

    return NextResponse.json(
      {
        success: true,
        message: "Passwort wurde erfolgreich zurückgesetzt. Sie können sich jetzt anmelden.",
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error({ err: error }, "Reset password error");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.",
    });
  }
}

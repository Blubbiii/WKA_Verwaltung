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

    // Atomic token claim: mark as used ONLY if not yet used and not expired.
    // This prevents race conditions where two concurrent requests both pass the check.
    const claimed = await prisma.passwordResetToken.updateMany({
      where: {
        token,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    if (claimed.count === 0) {
      // Frontend reset-password/page.tsx checkt explizit auf code === "INVALID_TOKEN"
      // um eine spezielle Fehlermeldung anzuzeigen.
      return apiError("INVALID_TOKEN", 400, {
        message: "Ungültiger, bereits verwendeter oder abgelaufener Token. Bitte fordern Sie einen neuen Reset-Link an.",
      });
    }

    // Fetch token data for user reference (already claimed, safe to read)
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: {
        user: {
          select: { id: true, email: true, status: true },
        },
      },
    });

    if (!resetToken || resetToken.user.status !== "ACTIVE") {
      return apiError("USER_INACTIVE", 400, {
        message: "Dieses Benutzerkonto ist nicht aktiv. Bitte kontaktieren Sie den Administrator.",
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, AUTH_CONFIG.bcryptSaltRounds);

    // Update user password and invalidate all other tokens
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      // Invalidate all other tokens for this user
      prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
          id: { not: resetToken.id },
        },
        data: { usedAt: new Date() },
      }),
    ]);

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

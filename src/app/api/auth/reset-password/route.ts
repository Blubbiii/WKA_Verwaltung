import { NextResponse } from "next/server";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { rateLimit, getClientIp, getRateLimitResponse, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

// Password requirements
const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_SALT_ROUNDS = 12;

// Validation Schema
const resetPasswordSchema = z.object({
  token: z.string().uuid("Ungültiger Token"),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`)
    .regex(/[A-Z]/, "Passwort muss mindestens einen Grossbuchstaben enthalten")
    .regex(/[a-z]/, "Passwort muss mindestens einen Kleinbuchstaben enthalten")
    .regex(/[0-9]/, "Passwort muss mindestens eine Zahl enthalten"),
});

export async function POST(request: Request) {
  try {
    // Rate limiting: prevent brute-force token guessing
    const ip = getClientIp(request);
    const rateLimitResult = rateLimit(`reset-password:${ip}`, AUTH_RATE_LIMIT);
    if (!rateLimitResult.success) {
      return getRateLimitResponse(rateLimitResult, AUTH_RATE_LIMIT);
    }

    const body = await request.json();

    // Validate input
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validierungsfehler",
          details: parsed.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
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
      return NextResponse.json(
        {
          success: false,
          error: "Ungültiger, bereits verwendeter oder abgelaufener Token. Bitte fordern Sie einen neuen Reset-Link an.",
        },
        { status: 400 }
      );
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
      return NextResponse.json(
        {
          success: false,
          error: "Dieses Benutzerkonto ist nicht aktiv. Bitte kontaktieren Sie den Administrator.",
        },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

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

    return NextResponse.json(
      {
        success: false,
        error: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.",
      },
      { status: 500 }
    );
  }
}

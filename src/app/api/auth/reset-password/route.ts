import { NextResponse } from "next/server";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// Password requirements
const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_SALT_ROUNDS = 12;

// Validation Schema
const resetPasswordSchema = z.object({
  token: z.string().uuid("Ungueltiger Token"),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`)
    .regex(/[A-Z]/, "Passwort muss mindestens einen Grossbuchstaben enthalten")
    .regex(/[a-z]/, "Passwort muss mindestens einen Kleinbuchstaben enthalten")
    .regex(/[0-9]/, "Passwort muss mindestens eine Zahl enthalten"),
});

export async function POST(request: Request) {
  try {
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

    // Find token in database
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: {
        user: {
          select: { id: true, email: true, status: true },
        },
      },
    });

    // Check if token exists
    if (!resetToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Ungueltiger oder abgelaufener Token. Bitte fordern Sie einen neuen Reset-Link an.",
        },
        { status: 400 }
      );
    }

    // Check if token was already used
    if (resetToken.usedAt !== null) {
      return NextResponse.json(
        {
          success: false,
          error: "Dieser Token wurde bereits verwendet. Bitte fordern Sie einen neuen Reset-Link an.",
        },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (new Date() > resetToken.expiresAt) {
      // Mark token as used (expired)
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });

      return NextResponse.json(
        {
          success: false,
          error: "Dieser Token ist abgelaufen. Bitte fordern Sie einen neuen Reset-Link an.",
        },
        { status: 400 }
      );
    }

    // Check if user is still active
    if (resetToken.user.status !== "ACTIVE") {
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

    // Update user password and mark token as used (in a transaction)
    await prisma.$transaction([
      // Update user password
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      // Mark token as used
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
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
        message: "Passwort wurde erfolgreich zurueckgesetzt. Sie koennen sich jetzt anmelden.",
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error({ err: error }, "Reset password error");

    return NextResponse.json(
      {
        success: false,
        error: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es spaeter erneut.",
      },
      { status: 500 }
    );
  }
}

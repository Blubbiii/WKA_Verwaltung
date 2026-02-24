/**
 * User Password Change API
 *
 * POST /api/user/password - Change current user's password
 *
 * Authentication: Any authenticated user (for their own password)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Validation Schema
// =============================================================================

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Aktuelles Passwort ist erforderlich"),
    newPassword: z
      .string()
      .min(8, "Neues Passwort muss mindestens 8 Zeichen lang sein"),
    confirmPassword: z.string().min(1, "Passwort-Bestätigung ist erforderlich"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwörter stimmen nicht überein",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message:
      "Das neue Passwort muss sich vom aktuellen Passwort unterscheiden",
    path: ["newPassword"],
  });

// =============================================================================
// POST /api/user/password
// =============================================================================

export async function POST(request: Request) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId } = check;

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      // Format errors for better frontend display
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) {
          fieldErrors[path] = issue.message;
        }
      }

      return NextResponse.json(
        { error: "Validierungsfehler", fieldErrors },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    // Fetch user with password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        {
          error: "Validierungsfehler",
          fieldErrors: {
            currentPassword: "Das aktuelle Passwort ist falsch",
          },
        },
        { status: 400 }
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password and invalidate all existing sessions
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      }),
      // Invalidate all sessions for this user to force re-login
      prisma.session.deleteMany({
        where: { userId: userId! },
      }),
    ]);

    // Create audit log for password change
    try {
      await createAuditLog({
        action: "UPDATE",
        entityType: "User",
        entityId: userId!,
        newValues: { action: "password_changed" },
      });
    } catch (auditError) {
      // Audit log failure should not prevent password change
      logger.error({ err: auditError }, "[Password Change] Audit log error");
    }

    return NextResponse.json({
      success: true,
      message: "Passwort wurde erfolgreich geändert",
    });
  } catch (error) {
    logger.error({ err: error }, "[User Password API] POST error");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

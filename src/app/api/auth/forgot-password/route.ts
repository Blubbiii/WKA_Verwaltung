import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import {
  rateLimit,
  getClientIp,
  getRateLimitResponse,
  AUTH_RATE_LIMIT,
} from "@/lib/rate-limit";
import { sendTemplatedEmailSync } from "@/lib/email";

// Validation Schema
const forgotPasswordSchema = z.object({
  email: z.string().email("Ungueltige E-Mail-Adresse"),
});

// Token Expiry: 1 hour
const TOKEN_EXPIRY_HOURS = 1;

export async function POST(request: Request) {
  // Rate limiting: 5 attempts per 15 minutes
  const clientIp = getClientIp(request);
  const rateLimitResult = rateLimit(
    `${clientIp}:/api/auth/forgot-password`,
    AUTH_RATE_LIMIT
  );
  if (!rateLimitResult.success) {
    return getRateLimitResponse(rateLimitResult, AUTH_RATE_LIMIT);
  }

  try {
    const body = await request.json();

    // Validate input
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      // Return success even for invalid input (security best practice)
      // Don't reveal if email format is invalid
      return NextResponse.json(
        {
          success: true,
          message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet."
        },
        { status: 200 }
      );
    }

    const { email } = parsed.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, status: true },
    });

    // Always return success (don't reveal if email exists - security)
    if (!user || user.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: true,
          message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet."
        },
        { status: 200 }
      );
    }

    // Invalidate any existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(), // Mark as used/invalidated
      },
    });

    // Generate secure token
    const token = randomUUID();

    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Store token in database
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Generate reset link
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    // Get user's name for the email template
    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true, tenantId: true },
    });

    const userName = [userDetails?.firstName, userDetails?.lastName]
      .filter(Boolean)
      .join(" ") || user.email;

    // Send password reset email synchronously (critical email - immediate delivery)
    const emailResult = await sendTemplatedEmailSync(
      "password-reset",
      {
        userName,
        resetUrl: resetLink,
        expiresIn: `${TOKEN_EXPIRY_HOURS} Stunde${TOKEN_EXPIRY_HOURS > 1 ? "n" : ""}`,
      },
      user.email,
      userDetails?.tenantId || ""
    );

    if (!emailResult.success) {
      // Log the error but do NOT expose it to the user (security best practice)
      logger.error(
        { error: emailResult.error, userId: user.id },
        "Failed to send password reset email"
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet."
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error({ err: error }, "Forgot password error");

    // Don't reveal internal errors to the user
    return NextResponse.json(
      {
        success: true,
        message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet."
      },
      { status: 200 }
    );
  }
}

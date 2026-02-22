/**
 * User Email Preferences API
 *
 * GET - Read current user's email notification preferences
 * PUT - Update current user's email notification preferences
 *
 * Authentication: Any authenticated user (for their own preferences)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { DEFAULT_EMAIL_PREFERENCES, type EmailPreferences } from "@/lib/email";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Validation Schema
// =============================================================================

const preferencesSchema = z.object({
  votes: z.boolean(),
  documents: z.boolean(),
  invoices: z.boolean(),
  contracts: z.boolean(),
  system: z.boolean(),
});

const updatePreferencesSchema = z.object({
  preferences: preferencesSchema,
});

// =============================================================================
// GET /api/user/email-preferences - Read preferences
// =============================================================================

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    // Note: emailPreferences is a new field, will be available after prisma generate
    const user = await prisma.user.findUnique({
      where: { id: check.userId! },
    }) as { emailPreferences?: unknown } | null;

    if (!user) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }

    // Parse preferences, using defaults if invalid or not set
    let preferences: EmailPreferences;

    try {
      const rawPrefs = user.emailPreferences;
      if (rawPrefs && typeof rawPrefs === "object") {
        preferences = rawPrefs as EmailPreferences;
      } else if (typeof rawPrefs === "string") {
        preferences = JSON.parse(rawPrefs);
      } else {
        preferences = DEFAULT_EMAIL_PREFERENCES;
      }

      // Validate structure
      preferencesSchema.parse(preferences);
    } catch {
      // Return defaults if parsing fails
      preferences = DEFAULT_EMAIL_PREFERENCES;
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    logger.error({ err: error }, "[User Email Preferences API] GET error");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/user/email-preferences - Update preferences
// =============================================================================

export async function PUT(request: Request) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { preferences } = parsed.data;

    // Update user preferences
    // Note: emailPreferences is a new field, will be available after prisma generate
    await prisma.user.update({
      where: { id: check.userId! },
      data: { emailPreferences: preferences } as Record<string, unknown>,
    });

    return NextResponse.json({
      success: true,
      preferences,
    });
  } catch (error) {
    logger.error({ err: error }, "[User Email Preferences API] PUT error");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

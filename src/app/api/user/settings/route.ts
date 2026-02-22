/**
 * User Settings API
 *
 * GET  /api/user/settings - Get current user profile + preferences
 * PUT  /api/user/settings - Update user profile + preferences
 *
 * Authentication: Any authenticated user (for their own settings)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { getSignedUrl } from "@/lib/storage";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Validation Schema
// =============================================================================

const updateSettingsSchema = z.object({
  firstName: z.string().min(1, "Vorname ist erforderlich").optional(),
  lastName: z.string().min(1, "Nachname ist erforderlich").optional(),
  phone: z.string().optional(),
  preferences: z
    .object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      language: z.enum(["de"]).optional(),
      notifications: z
        .object({
          email: z.boolean().optional(),
          invoices: z.boolean().optional(),
          contracts: z.boolean().optional(),
          votes: z.boolean().optional(),
        })
        .optional(),
      defaultPageSize: z.number().min(10).max(100).optional(),
      defaultStartPage: z.string().optional(),
    })
    .optional(),
});

// =============================================================================
// GET /api/user/settings
// =============================================================================

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId } = check;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        avatarUrl: true,
        settings: true,
        emailPreferences: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Parse the settings JSON to extract preferences
    const rawSettings =
      user.settings && typeof user.settings === "object"
        ? (user.settings as Record<string, unknown>)
        : {};

    const preferences = {
      theme: (rawSettings.theme as string) || "system",
      language: (rawSettings.language as string) || "de",
      notifications: (rawSettings.notifications as Record<string, boolean>) || {
        email: true,
        invoices: true,
        contracts: true,
        votes: true,
      },
      defaultPageSize: (rawSettings.defaultPageSize as number) || 25,
      defaultStartPage: (rawSettings.defaultStartPage as string) || "/dashboard",
    };

    // Generate signed URL for avatar if it exists
    let avatarSignedUrl: string | null = null;
    if (user.avatarUrl) {
      try {
        avatarSignedUrl = await getSignedUrl(user.avatarUrl, 3600);
      } catch (error) {
        logger.warn({ err: error }, "[User Settings API] Could not generate avatar URL");
      }
    }

    return NextResponse.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatarUrl: avatarSignedUrl,
      preferences,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    });
  } catch (error) {
    logger.error({ err: error }, "[User Settings API] GET error");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/user/settings
// =============================================================================

export async function PUT(request: Request) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId } = check;

    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { firstName, lastName, phone, preferences } = parsed.data;

    // Fetch current user to merge settings
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Build update data for profile fields
    const profileUpdate: Record<string, unknown> = {};
    if (firstName !== undefined) profileUpdate.firstName = firstName;
    if (lastName !== undefined) profileUpdate.lastName = lastName;
    if (phone !== undefined) profileUpdate.phone = phone;

    // Merge preferences into existing settings JSON
    if (preferences) {
      const existingSettings =
        currentUser.settings && typeof currentUser.settings === "object"
          ? (currentUser.settings as Record<string, unknown>)
          : {};

      // Deep merge notifications
      const existingNotifications =
        (existingSettings.notifications as Record<string, boolean>) || {};
      const mergedNotifications = preferences.notifications
        ? { ...existingNotifications, ...preferences.notifications }
        : existingNotifications;

      const mergedSettings = {
        ...existingSettings,
        ...(preferences.theme !== undefined && { theme: preferences.theme }),
        ...(preferences.language !== undefined && {
          language: preferences.language,
        }),
        ...(preferences.notifications !== undefined && {
          notifications: mergedNotifications,
        }),
        ...(preferences.defaultPageSize !== undefined && {
          defaultPageSize: preferences.defaultPageSize,
        }),
        ...(preferences.defaultStartPage !== undefined && {
          defaultStartPage: preferences.defaultStartPage,
        }),
      };

      profileUpdate.settings = mergedSettings;
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: profileUpdate,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        settings: true,
      },
    });

    // Parse settings for response
    const rawSettings =
      updatedUser.settings && typeof updatedUser.settings === "object"
        ? (updatedUser.settings as Record<string, unknown>)
        : {};

    const responsePreferences = {
      theme: (rawSettings.theme as string) || "system",
      language: (rawSettings.language as string) || "de",
      notifications: (rawSettings.notifications as Record<string, boolean>) || {
        email: true,
        invoices: true,
        contracts: true,
        votes: true,
      },
      defaultPageSize: (rawSettings.defaultPageSize as number) || 25,
      defaultStartPage:
        (rawSettings.defaultStartPage as string) || "/dashboard",
    };

    return NextResponse.json({
      success: true,
      id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      preferences: responsePreferences,
    });
  } catch (error) {
    logger.error({ err: error }, "[User Settings API] PUT error");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

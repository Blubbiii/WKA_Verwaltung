// ===========================================
// API: User Sidebar Group Order
// GET  /api/user/sidebar-order - Get saved order
// PUT  /api/user/sidebar-order - Save new order
// DELETE /api/user/sidebar-order - Reset to default
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import type { UserSettings } from "@/types/dashboard";
import { apiLogger as logger } from "@/lib/logger";

const DEFAULT_GROUP_ORDER = [
  "crm",
  "inbox",
  "windparks",
  "finances",
  "administration",
  "communication",
];

const updateSchema = z.object({
  order: z.array(z.string().min(1)).min(1).max(20),
});

// ===========================================
// GET /api/user/sidebar-order
// ===========================================

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const user = await prisma.user.findUnique({
      where: { id: check.userId },
      select: { settings: true },
    });

    const settings = (user?.settings as UserSettings) || {};
    return NextResponse.json({
      order: settings.sidebarGroupOrder ?? DEFAULT_GROUP_ORDER,
      isDefault: !settings.sidebarGroupOrder,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching sidebar order");
    return NextResponse.json(
      { error: "Fehler beim Laden der Sidebar-Reihenfolge" },
      { status: 500 }
    );
  }
}

// ===========================================
// PUT /api/user/sidebar-order
// ===========================================

export async function PUT(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: check.userId },
      select: { settings: true },
    });

    const existing = (user?.settings as UserSettings) || {};
    const updated: UserSettings = {
      ...existing,
      sidebarGroupOrder: parsed.data.order,
    };

    await prisma.user.update({
      where: { id: check.userId },
      data: {
        settings: updated as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      order: parsed.data.order,
      isDefault: false,
    });
  } catch (error) {
    logger.error({ err: error }, "Error saving sidebar order");
    return NextResponse.json(
      { error: "Fehler beim Speichern" },
      { status: 500 }
    );
  }
}

// ===========================================
// DELETE /api/user/sidebar-order
// ===========================================

export async function DELETE() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const user = await prisma.user.findUnique({
      where: { id: check.userId },
      select: { settings: true },
    });

    const existing = (user?.settings as UserSettings) || {};
    const { sidebarGroupOrder: _, ...rest } = existing;

    await prisma.user.update({
      where: { id: check.userId },
      data: {
        settings: rest as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      order: DEFAULT_GROUP_ORDER,
      isDefault: true,
    });
  } catch (error) {
    logger.error({ err: error }, "Error resetting sidebar order");
    return NextResponse.json(
      { error: "Fehler beim Zurücksetzen" },
      { status: 500 }
    );
  }
}

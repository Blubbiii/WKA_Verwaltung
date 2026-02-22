// ===========================================
// API: Available Dashboard Widgets
// GET /api/dashboard/widgets - Get all widgets available for the current user
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { UserRole } from "@prisma/client";
import {
  getWidgetsForRole,
  getWidgetsByCategory,
  WIDGET_CATEGORIES,
} from "@/lib/dashboard/widget-registry";
import { cache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/cache/types";
import { apiLogger as logger } from "@/lib/logger";

// ===========================================
// GET /api/dashboard/widgets
// ===========================================

export async function GET(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId } = check;

    // Fetch user to get role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    const userRole = user.role as UserRole;

    // Get query params
    const { searchParams } = new URL(request.url);
    const groupByCategory = searchParams.get("grouped") === "true";
    const category = searchParams.get("category");

    // Build cache key based on role + query params (widgets are role-dependent, not user-specific)
    const cacheKey = `dashboard:widgets:${userRole}:grouped=${groupByCategory}:category=${category || "all"}`;

    // Try cache first
    let cacheHit = false;
    try {
      const cached = await cache.get<Record<string, unknown>>(cacheKey);
      if (cached) {
        cacheHit = true;
        return NextResponse.json(cached, {
          headers: {
            "X-Cache": "HIT",
            "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
          },
        });
      }
    } catch (error) {
      logger.warn("[Widgets] Cache read error: %s", error instanceof Error ? error.message : "Unknown error");
    }

    let result: Record<string, unknown>;

    if (groupByCategory) {
      // Return widgets grouped by category
      const widgetsByCategory = getWidgetsByCategory(userRole);

      // Filter categories that have widgets
      const availableCategories = WIDGET_CATEGORIES.filter(
        (cat) => widgetsByCategory[cat.id] && widgetsByCategory[cat.id].length > 0
      );

      result = {
        categories: availableCategories,
        widgetsByCategory,
        totalCount: Object.values(widgetsByCategory).flat().length,
      };
    } else {
      // Get all available widgets for the role
      let widgets = getWidgetsForRole(userRole);

      // Filter by category if specified
      if (category) {
        widgets = widgets.filter((w) => w.category === category);
      }

      // Filter available categories (only those with widgets)
      const widgetsByCategory = getWidgetsByCategory(userRole);
      const availableCategories = WIDGET_CATEGORIES.filter(
        (cat) => widgetsByCategory[cat.id] && widgetsByCategory[cat.id].length > 0
      );

      result = {
        widgets,
        categories: availableCategories,
        totalCount: widgets.length,
      };
    }

    // Cache the result (widget config rarely changes, 1 hour TTL)
    cache.set(cacheKey, result, CACHE_TTL.LONG).catch((err) => {
      logger.warn({ err: err }, "[Widgets] Cache write error");
    });

    return NextResponse.json(result, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching available widgets");
    return NextResponse.json(
      { error: "Fehler beim Laden der verfuegbaren Widgets" },
      { status: 500 }
    );
  }
}

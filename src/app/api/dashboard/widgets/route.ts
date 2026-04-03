// ===========================================
// API: Available Dashboard Widgets
// GET /api/dashboard/widgets - Get all widgets available for the current user
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/withPermission";
import { getUserHighestHierarchy } from "@/lib/auth/permissions";
import type { UserRole } from "@/types/dashboard";
import { hasMinimumRole } from "@/types/dashboard";
import {
  WIDGET_REGISTRY,
  WIDGET_CATEGORIES,
} from "@/lib/dashboard/widget-registry";
import { prisma } from "@/lib/prisma";
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

    // Derive role label from hierarchy for widget filtering
    const hierarchy = await getUserHighestHierarchy(userId!);
    const userRole: UserRole =
      hierarchy >= 100 ? "SUPERADMIN" :
      hierarchy >= 80  ? "ADMIN" :
      hierarchy >= 60  ? "MANAGER" :
      "VIEWER";

    // Get query params
    const { searchParams } = new URL(request.url);
    const groupByCategory = searchParams.get("grouped") === "true";
    const category = searchParams.get("category");

    // Fetch DB overrides for widget minRole (per tenant)
    const tenantId = check.tenantId ?? null;
    const overrideMap = new Map<string, UserRole>();
    try {
      const overrides = await prisma.systemConfig.findMany({
        where: {
          tenantId,
          key: { startsWith: "widget.minRole." },
          category: "dashboard",
        },
      });
      for (const o of overrides) {
        const widgetId = o.key.replace("widget.minRole.", "");
        overrideMap.set(widgetId, o.value as UserRole);
      }
    } catch (err) {
      logger.warn({ err }, "[Widgets] Failed to load widget visibility overrides, using defaults");
    }

    // Helper: get effective minRole for a widget (DB override > registry default)
    const getEffectiveMinRole = (widgetId: string, defaultMinRole: UserRole): UserRole =>
      overrideMap.get(widgetId) ?? defaultMinRole;

    // Filter widgets using effective minRole (override or default)
    const getWidgetsForRoleWithOverrides = () =>
      WIDGET_REGISTRY.filter((w) =>
        hasMinimumRole(userRole, getEffectiveMinRole(w.id, w.minRole as UserRole))
      );

    // Build cache key — include tenant to separate override sets
    const cacheKey = `dashboard:widgets:${tenantId || "global"}:${userRole}:grouped=${groupByCategory}:category=${category || "all"}`;

    // Skip cache when overrides exist (they change infrequently but should take effect immediately)
    if (overrideMap.size === 0) {
      try {
        const cached = await cache.get<Record<string, unknown>>(cacheKey);
        if (cached) {
          return NextResponse.json(cached, {
            headers: {
              "X-Cache": "HIT",
              "Cache-Control": `private, max-age=${CACHE_TTL.DASHBOARD}, stale-while-revalidate=${CACHE_TTL.DASHBOARD * 2}`,
            },
          });
        }
      } catch (error) {
        logger.warn("[Widgets] Cache read error: %s", error instanceof Error ? error.message : "Unknown error");
      }
    }

    let result: Record<string, unknown>;

    if (groupByCategory) {
      // Return widgets grouped by category (with override-aware filtering)
      const allWidgets = getWidgetsForRoleWithOverrides();
      const widgetsByCategory = allWidgets.reduce((acc, widget) => {
        if (!acc[widget.category]) acc[widget.category] = [];
        acc[widget.category].push(widget);
        return acc;
      }, {} as Record<string, typeof allWidgets>);

      const availableCategories = WIDGET_CATEGORIES.filter(
        (cat) => widgetsByCategory[cat.id] && widgetsByCategory[cat.id].length > 0
      );

      result = {
        categories: availableCategories,
        widgetsByCategory,
        totalCount: allWidgets.length,
      };
    } else {
      // Get all available widgets for the role (with overrides)
      let widgets = getWidgetsForRoleWithOverrides();

      // Filter by category if specified
      if (category) {
        widgets = widgets.filter((w) => w.category === category);
      }

      // Filter available categories (only those with widgets)
      const allWidgets = getWidgetsForRoleWithOverrides();
      const widgetsByCat = allWidgets.reduce((acc, widget) => {
        if (!acc[widget.category]) acc[widget.category] = [];
        acc[widget.category].push(widget);
        return acc;
      }, {} as Record<string, typeof allWidgets>);
      const availableCategories = WIDGET_CATEGORIES.filter(
        (cat) => widgetsByCat[cat.id] && widgetsByCat[cat.id].length > 0
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
        "Cache-Control": `private, max-age=${CACHE_TTL.DASHBOARD}, stale-while-revalidate=${CACHE_TTL.DASHBOARD * 2}`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching available widgets");
    return NextResponse.json(
      { error: "Fehler beim Laden der verfügbaren Widgets" },
      { status: 500 }
    );
  }
}

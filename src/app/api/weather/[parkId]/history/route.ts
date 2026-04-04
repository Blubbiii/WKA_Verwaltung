/**
 * Weather History API Route
 *
 * GET /api/weather/[parkId]/history - Get historical weather data
 *
 * Query Parameters:
 * - from: ISO date string - Start date (default: 7 days ago)
 * - to: ISO date string - End date (default: now)
 * - page: number - Page number (default: 1)
 * - limit: number - Items per page (default: 100, max: 500)
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { getHistoricalWeather, WeatherApiError } from "@/lib/weather";
import { apiLogger as logger } from "@/lib/logger";
import { parsePaginationParams } from "@/lib/api-utils";
import { CACHE_TTL } from "@/lib/cache/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ parkId: string }> }
) {
  try {
    // Check permissions
    const check = await requirePermission(PERMISSIONS.PARKS_READ);
    if (!check.authorized) return check.error;

    const { parkId } = await params;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const { page, limit } = parsePaginationParams(searchParams, { defaultLimit: 100, maxLimit: 500 });
    const period = searchParams.get("period") as "7d" | "30d" | "90d" | "365d" | null;

    // Parse dates
    const to = toParam ? new Date(toParam) : new Date();
    let from: Date;

    if (fromParam) {
      from = new Date(fromParam);
    } else if (period) {
      const periodDays = {
        "7d": 7,
        "30d": 30,
        "90d": 90,
        "365d": 365,
      };
      from = new Date(to.getTime() - (periodDays[period] || 7) * 24 * 60 * 60 * 1000);
    } else {
      // Default: last 7 days
      from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Validate dates
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json(
        { error: "Ungültiges Datumsformat. Bitte ISO-Format verwenden." },
        { status: 400 }
      );
    }

    if (from > to) {
      return NextResponse.json(
        { error: "Start-Datum muss vor End-Datum liegen." },
        { status: 400 }
      );
    }

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden" },
        { status: 404 }
      );
    }

    // Get historical weather data
    const historicalData = await getHistoricalWeather(parkId, {
      from,
      to,
      page,
      limit,
    });

    // Set cache headers (historical data doesn't change)
    const response = NextResponse.json(historicalData);
    response.headers.set(
      "Cache-Control",
      `public, max-age=${CACHE_TTL.MEDIUM}, stale-while-revalidate=${CACHE_TTL.TENANT_SETTINGS}` // 5 minutes / 10 minutes
    );

    return response;
  } catch (error) {
    logger.error({ err: error }, "[Weather History API] Error");

    if (error instanceof WeatherApiError) {
      return NextResponse.json(
        {
          error: error.message,
          code: (error.apiResponse as { code?: string })?.code,
        },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: "Fehler beim Laden der historischen Wetterdaten" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/weather/[parkId]/history/statistics - Get weather statistics
 * Note: This is handled by query parameter ?stats=true
 */

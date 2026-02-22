/**
 * Weather API Route
 *
 * GET /api/weather/[parkId] - Get current weather and forecast for a park
 *
 * Query Parameters:
 * - forecast: boolean - Include 5-day forecast (default: true)
 * - refresh: boolean - Force refresh from API (default: false)
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import {
  getWeatherForPark,
  isWeatherApiConfigured,
  WeatherApiError,
} from "@/lib/weather";

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
    const includeForecast = searchParams.get("forecast") !== "false";
    const forceRefresh = searchParams.get("refresh") === "true";

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden" },
        { status: 404 }
      );
    }

    // Check if park has coordinates
    if (!park.latitude || !park.longitude) {
      return NextResponse.json(
        {
          error: "Park hat keine Koordinaten hinterlegt",
          parkId: park.id,
          parkName: park.name,
        },
        { status: 400 }
      );
    }

    // Check if weather API is configured
    if (!isWeatherApiConfigured() && forceRefresh) {
      return NextResponse.json(
        {
          error:
            "Wetter-API nicht konfiguriert. Bitte OPENWEATHERMAP_API_KEY setzen.",
          configured: false,
        },
        { status: 503 }
      );
    }

    // Get weather data
    const weatherData = await getWeatherForPark(parkId, {
      includeForecast,
      forceRefresh,
    });

    // Set cache headers based on data source
    const cacheMaxAge =
      weatherData.source === "cache"
        ? 60 // 1 minute if from cache
        : weatherData.source === "api"
          ? 1800 // 30 minutes if fresh from API
          : 300; // 5 minutes if from database

    const response = NextResponse.json(weatherData);

    // Add cache control headers
    response.headers.set(
      "Cache-Control",
      `public, max-age=${cacheMaxAge}, stale-while-revalidate=${cacheMaxAge * 2}`
    );
    response.headers.set("X-Weather-Source", weatherData.source);

    return response;
  } catch (error) {
    logger.error({ err: error }, "[Weather API] Error");

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
      { error: "Fehler beim Laden der Wetterdaten" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/weather/[parkId] - Force refresh weather data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ parkId: string }> }
) {
  try {
    // Check permissions (need write permission for manual refresh)
    const check = await requirePermission(PERMISSIONS.PARKS_UPDATE);
    if (!check.authorized) return check.error;

    const { parkId } = await params;

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden" },
        { status: 404 }
      );
    }

    // Check if park has coordinates
    if (!park.latitude || !park.longitude) {
      return NextResponse.json(
        {
          error: "Park hat keine Koordinaten hinterlegt",
          parkId: park.id,
          parkName: park.name,
        },
        { status: 400 }
      );
    }

    // Check if weather API is configured
    if (!isWeatherApiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Wetter-API nicht konfiguriert. Bitte OPENWEATHERMAP_API_KEY setzen.",
          configured: false,
        },
        { status: 503 }
      );
    }

    // Force refresh weather data
    const weatherData = await getWeatherForPark(parkId, {
      includeForecast: true,
      forceRefresh: true,
    });

    return NextResponse.json({
      success: true,
      message: "Wetterdaten aktualisiert",
      data: weatherData,
    });
  } catch (error) {
    logger.error({ err: error }, "[Weather API] Refresh error");

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
      { error: "Fehler beim Aktualisieren der Wetterdaten" },
      { status: 500 }
    );
  }
}

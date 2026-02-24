/**
 * Weather Service
 *
 * Main service for weather operations in WindparkManager
 * Coordinates between API, cache, and database
 */

import { prisma } from "../prisma";
import { logger } from "@/lib/logger";
import {
  getCurrentWeather,
  getForecast,
  getWeatherWithForecast,
  isWeatherApiConfigured,
} from "./openweathermap";
import {
  getCachedWeather,
  setCachedWeather,
  invalidateParkCache,
  setLastSyncTime,
  getLastSyncTime,
} from "./cache";
import {
  WeatherResponse,
  HistoricalWeatherResponse,
  CurrentWeather,
  DailyForecast,
  WeatherStatistics,
  WeatherApiError,
  WeatherErrorCode,
  getWindDirectionLabel,
} from "./types";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert Decimal to number safely
 */
function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? null : parsed;
}

// =============================================================================
// Park Weather Operations
// =============================================================================

/**
 * Get weather for a park (with caching)
 */
export async function getWeatherForPark(
  parkId: string,
  options?: {
    includeForecast?: boolean;
    forceRefresh?: boolean;
  }
): Promise<WeatherResponse> {
  const { includeForecast = true, forceRefresh = false } = options || {};

  // Get park details
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!park) {
    throw new WeatherApiError("Park nicht gefunden", 404, {
      code: WeatherErrorCode.PARK_NOT_FOUND,
    });
  }

  const lat = decimalToNumber(park.latitude);
  const lon = decimalToNumber(park.longitude);

  if (!lat || !lon) {
    throw new WeatherApiError(
      "Park hat keine Koordinaten hinterlegt",
      400,
      { code: WeatherErrorCode.NO_COORDINATES }
    );
  }

  // Check cache first (unless forced refresh)
  if (!forceRefresh) {
    const cached = await getCachedWeather(parkId);
    if (cached) {
      return {
        parkId: park.id,
        parkName: park.name,
        location: { lat, lon },
        current: {
          temperature: cached.current.temperature,
          humidity: cached.current.humidity,
          pressure: cached.current.pressure,
          windSpeed: cached.current.windSpeed,
          windDirection: cached.current.windDirection,
          windGust: cached.current.windGust,
          description: cached.current.description,
          icon: cached.current.icon,
          timestamp: cached.current.timestamp.toString(),
        },
        forecast: includeForecast
          ? cached.forecast?.map((f) => ({
              date: f.date,
              tempMin: f.tempMin,
              tempMax: f.tempMax,
              windSpeed: f.windSpeed,
              windSpeedMax: f.windSpeedMax,
              description: f.description,
              icon: f.icon,
              precipitationProbability: f.precipitationProbability,
            }))
          : undefined,
        lastUpdated: cached.cachedAt,
        source: "cache",
      };
    }
  }

  // Check if API is configured
  if (!isWeatherApiConfigured()) {
    // Fall back to database
    return getWeatherFromDatabase(park.id, park.name, lat, lon, includeForecast);
  }

  // Fetch from API
  try {
    let current: CurrentWeather;
    let forecast: DailyForecast[] | undefined;

    if (includeForecast) {
      const result = await getWeatherWithForecast(lat, lon, 5);
      current = result.current;
      forecast = result.forecast;

      // Cache the result
      await setCachedWeather(parkId, {
        current,
        forecast,
        hourlyForecast: result.hourlyForecast,
      });
    } else {
      current = await getCurrentWeather(lat, lon);

      // Cache current only
      await setCachedWeather(parkId, { current });
    }

    // Save to database asynchronously
    saveWeatherToDatabase(parkId, current).catch((error) => {
      logger.error(
        `[WeatherService] Error saving weather to database for park ${parkId}:`,
        error
      );
    });

    // Update last sync time
    await setLastSyncTime(parkId);

    return {
      parkId: park.id,
      parkName: park.name,
      location: { lat, lon },
      current: {
        temperature: current.temperature,
        humidity: current.humidity,
        pressure: current.pressure,
        windSpeed: current.windSpeed,
        windDirection: current.windDirection,
        windGust: current.windGust,
        description: current.description,
        icon: current.icon,
        timestamp: current.timestamp.toISOString(),
      },
      forecast: forecast?.map((f) => ({
        date: f.date,
        tempMin: f.tempMin,
        tempMax: f.tempMax,
        windSpeed: f.windSpeed,
        windSpeedMax: f.windSpeedMax,
        description: f.description,
        icon: f.icon,
        precipitationProbability: f.precipitationProbability,
      })),
      lastUpdated: new Date().toISOString(),
      source: "api",
    };
  } catch (error) {
    logger.error(
      { err: error },
      `[WeatherService] API error for park ${parkId}, falling back to database`
    );

    // Fall back to database on API error
    return getWeatherFromDatabase(park.id, park.name, lat, lon, includeForecast);
  }
}

/**
 * Get weather from database (fallback)
 */
async function getWeatherFromDatabase(
  parkId: string,
  parkName: string,
  lat: number,
  lon: number,
  includeForecast: boolean
): Promise<WeatherResponse> {
  const latestData = await prisma.weatherData.findFirst({
    where: { parkId },
    orderBy: { recordedAt: "desc" },
  });

  if (!latestData) {
    throw new WeatherApiError(
      "Keine Wetterdaten verfügbar. Bitte stellen Sie sicher, dass ein API-Schluessel konfiguriert ist.",
      503,
      { code: WeatherErrorCode.API_ERROR }
    );
  }

  return {
    parkId,
    parkName,
    location: { lat, lon },
    current: {
      temperature: decimalToNumber(latestData.temperatureC) || 0,
      humidity: latestData.humidityPercent || 0,
      pressure: decimalToNumber(latestData.pressureHpa) || 1013,
      windSpeed: decimalToNumber(latestData.windSpeedMs) || 0,
      windDirection: latestData.windDirectionDeg || 0,
      description: latestData.weatherCondition || "Unbekannt",
      icon: "01d",
      timestamp: latestData.recordedAt.toISOString(),
    },
    forecast: includeForecast ? undefined : undefined, // No forecast from database
    lastUpdated: latestData.createdAt.toISOString(),
    source: "database",
  };
}

/**
 * Save weather data to database
 */
export async function saveWeatherToDatabase(
  parkId: string,
  data: CurrentWeather
): Promise<void> {
  await prisma.weatherData.create({
    data: {
      parkId,
      recordedAt: data.timestamp,
      windSpeedMs: data.windSpeed,
      windDirectionDeg: data.windDirection,
      temperatureC: data.temperature,
      humidityPercent: data.humidity,
      pressureHpa: data.pressure,
      weatherCondition: data.description,
      source: "openweathermap",
      rawData: {
        feelsLike: data.feelsLike,
        windGust: data.windGust,
        cloudCover: data.cloudCover,
        visibility: data.visibility,
        icon: data.icon,
      },
    },
  });

  logger.info(`[WeatherService] Saved weather data for park ${parkId}`);
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Sync weather for all parks of a tenant
 */
export async function syncWeatherForAllParks(
  tenantId: string
): Promise<{
  success: number;
  failed: number;
  skipped: number;
  results: Array<{
    parkId: string;
    parkName: string;
    status: "success" | "failed" | "skipped";
    error?: string;
  }>;
}> {
  // Get all active parks for tenant
  const parks = await prisma.park.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
    },
  });

  const results: Array<{
    parkId: string;
    parkName: string;
    status: "success" | "failed" | "skipped";
    error?: string;
  }> = [];

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const park of parks) {
    const lat = decimalToNumber(park.latitude);
    const lon = decimalToNumber(park.longitude);

    if (!lat || !lon) {
      results.push({
        parkId: park.id,
        parkName: park.name,
        status: "skipped",
        error: "Keine Koordinaten",
      });
      skipped++;
      continue;
    }

    try {
      await getWeatherForPark(park.id, {
        includeForecast: true,
        forceRefresh: true,
      });

      results.push({
        parkId: park.id,
        parkName: park.name,
        status: "success",
      });
      success++;
    } catch (error) {
      results.push({
        parkId: park.id,
        parkName: park.name,
        status: "failed",
        error:
          error instanceof Error ? error.message : "Unbekannter Fehler",
      });
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.info(
    `[WeatherService] Synced weather for tenant ${tenantId}: ${success} success, ${failed} failed, ${skipped} skipped`
  );

  return { success, failed, skipped, results };
}

/**
 * Refresh weather for a single park (for manual refresh)
 */
export async function refreshWeatherForPark(parkId: string): Promise<void> {
  // Invalidate cache
  await invalidateParkCache(parkId);

  // Fetch fresh data
  await getWeatherForPark(parkId, {
    includeForecast: true,
    forceRefresh: true,
  });
}

// =============================================================================
// Historical Data Operations
// =============================================================================

/**
 * Get historical weather data from database
 */
export async function getHistoricalWeather(
  parkId: string,
  options?: {
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }
): Promise<HistoricalWeatherResponse> {
  const { from, to, page = 1, limit = 100 } = options || {};

  // Default to last 7 days if no range specified
  const defaultTo = to || new Date();
  const defaultFrom = from || new Date(defaultTo.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get park details
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!park) {
    throw new WeatherApiError("Park nicht gefunden", 404, {
      code: WeatherErrorCode.PARK_NOT_FOUND,
    });
  }

  // Get weather data
  const [data, total] = await Promise.all([
    prisma.weatherData.findMany({
      where: {
        parkId,
        recordedAt: {
          gte: defaultFrom,
          lte: defaultTo,
        },
      },
      orderBy: { recordedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.weatherData.count({
      where: {
        parkId,
        recordedAt: {
          gte: defaultFrom,
          lte: defaultTo,
        },
      },
    }),
  ]);

  // Calculate statistics if we have data
  let statistics: WeatherStatistics | null = null;

  if (data.length > 0) {
    const windSpeeds = data
      .map((d) => decimalToNumber(d.windSpeedMs))
      .filter((v): v is number => v !== null);
    const temperatures = data
      .map((d) => decimalToNumber(d.temperatureC))
      .filter((v): v is number => v !== null);
    const humidities = data
      .map((d) => d.humidityPercent)
      .filter((v): v is number => v !== null);
    const pressures = data
      .map((d) => decimalToNumber(d.pressureHpa))
      .filter((v): v is number => v !== null);

    if (windSpeeds.length > 0) {
      statistics = {
        avgWindSpeed:
          Math.round(
            (windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length) * 10
          ) / 10,
        maxWindSpeed: Math.max(...windSpeeds),
        minWindSpeed: Math.min(...windSpeeds),
        avgTemperature:
          temperatures.length > 0
            ? Math.round(
                (temperatures.reduce((a, b) => a + b, 0) / temperatures.length) *
                  10
              ) / 10
            : 0,
        maxTemperature:
          temperatures.length > 0 ? Math.max(...temperatures) : 0,
        minTemperature:
          temperatures.length > 0 ? Math.min(...temperatures) : 0,
        avgHumidity:
          humidities.length > 0
            ? Math.round(
                humidities.reduce((a, b) => a + b, 0) / humidities.length
              )
            : 0,
        avgPressure:
          pressures.length > 0
            ? Math.round(
                pressures.reduce((a, b) => a + b, 0) / pressures.length
              )
            : 0,
        totalPrecipitation: 0, // Not tracked currently
        dataPoints: total,
        period: {
          from: defaultFrom,
          to: defaultTo,
        },
      };
    }
  }

  return {
    parkId: park.id,
    parkName: park.name,
    data: data.map((d) => ({
      id: d.id,
      recordedAt: d.recordedAt.toISOString(),
      windSpeedMs: decimalToNumber(d.windSpeedMs),
      windDirectionDeg: d.windDirectionDeg,
      temperatureC: decimalToNumber(d.temperatureC),
      humidityPercent: d.humidityPercent,
      pressureHpa: decimalToNumber(d.pressureHpa),
      weatherCondition: d.weatherCondition,
    })),
    statistics,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    period: {
      from: defaultFrom.toISOString(),
      to: defaultTo.toISOString(),
    },
  };
}

/**
 * Get weather statistics for a park
 */
export async function getWeatherStatistics(
  parkId: string,
  period: "7d" | "30d" | "90d" | "365d"
): Promise<WeatherStatistics | null> {
  const now = new Date();
  const periodDays = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "365d": 365,
  };

  const from = new Date(now.getTime() - periodDays[period] * 24 * 60 * 60 * 1000);

  const data = await prisma.weatherData.findMany({
    where: {
      parkId,
      recordedAt: {
        gte: from,
        lte: now,
      },
    },
    select: {
      windSpeedMs: true,
      temperatureC: true,
      humidityPercent: true,
      pressureHpa: true,
    },
  });

  if (data.length === 0) {
    return null;
  }

  const windSpeeds = data
    .map((d) => decimalToNumber(d.windSpeedMs))
    .filter((v): v is number => v !== null);
  const temperatures = data
    .map((d) => decimalToNumber(d.temperatureC))
    .filter((v): v is number => v !== null);
  const humidities = data
    .map((d) => d.humidityPercent)
    .filter((v): v is number => v !== null);
  const pressures = data
    .map((d) => decimalToNumber(d.pressureHpa))
    .filter((v): v is number => v !== null);

  return {
    avgWindSpeed:
      windSpeeds.length > 0
        ? Math.round(
            (windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length) * 10
          ) / 10
        : 0,
    maxWindSpeed: windSpeeds.length > 0 ? Math.max(...windSpeeds) : 0,
    minWindSpeed: windSpeeds.length > 0 ? Math.min(...windSpeeds) : 0,
    avgTemperature:
      temperatures.length > 0
        ? Math.round(
            (temperatures.reduce((a, b) => a + b, 0) / temperatures.length) * 10
          ) / 10
        : 0,
    maxTemperature: temperatures.length > 0 ? Math.max(...temperatures) : 0,
    minTemperature: temperatures.length > 0 ? Math.min(...temperatures) : 0,
    avgHumidity:
      humidities.length > 0
        ? Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length)
        : 0,
    avgPressure:
      pressures.length > 0
        ? Math.round(pressures.reduce((a, b) => a + b, 0) / pressures.length)
        : 0,
    totalPrecipitation: 0,
    dataPoints: data.length,
    period: {
      from,
      to: now,
    },
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get last sync time for a park
 */
export async function getParkLastSyncTime(parkId: string): Promise<Date | null> {
  return getLastSyncTime(parkId);
}

/**
 * Check if weather sync is needed for a park
 */
export async function isWeatherSyncNeeded(
  parkId: string,
  maxAgeMinutes: number = 30
): Promise<boolean> {
  const lastSync = await getLastSyncTime(parkId);

  if (!lastSync) {
    return true;
  }

  const age = Date.now() - lastSync.getTime();
  return age > maxAgeMinutes * 60 * 1000;
}

/**
 * Get parks that need weather sync
 */
export async function getParksNeedingSync(
  tenantId: string,
  maxAgeMinutes: number = 30
): Promise<string[]> {
  const parks = await prisma.park.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      latitude: { not: null },
      longitude: { not: null },
    },
    select: { id: true },
  });

  const parksNeedingSync: string[] = [];

  for (const park of parks) {
    const needsSync = await isWeatherSyncNeeded(park.id, maxAgeMinutes);
    if (needsSync) {
      parksNeedingSync.push(park.id);
    }
  }

  return parksNeedingSync;
}

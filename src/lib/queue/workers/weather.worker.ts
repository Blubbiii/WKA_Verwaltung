/**
 * Weather Worker - Verarbeitet Jobs aus der "weather" Queue
 *
 * Dieser Worker ist verantwortlich für Wetterdaten-Abfragen:
 * - Aktuelle Wetterdaten für Windparks
 * - Wettervorhersagen
 * - Speichern in Datenbank und Cache
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { prisma } from "../../prisma";
import { jobLogger } from "@/lib/logger";
import {
  getWeatherForPark,
  saveWeatherToDatabase,
  syncWeatherForAllParks,
  isWeatherApiConfigured,
  getCurrentWeather,
  getWeatherWithForecast,
  setCachedWeather,
  setLastSyncTime,
  WeatherApiError,
} from "../../weather";
import { WeatherJobData, WeatherJobResult } from "../queues/weather.queue";

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

/**
 * Logger
 */
const logger = jobLogger.child({ component: "weather-worker" });

function log(
  level: "info" | "warn" | "error",
  jobId: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const logData = { jobId, ...meta };
  if (level === "error") {
    logger.error(logData, message);
  } else if (level === "warn") {
    logger.warn(logData, message);
  } else {
    logger.info(logData, message);
  }
}

// =============================================================================
// Main Job Processor
// =============================================================================

/**
 * Verarbeitet einen Weather-Sync-Job
 */
async function processWeatherJob(
  job: Job<WeatherJobData, WeatherJobResult>
): Promise<WeatherJobResult> {
  const { data } = job;
  const jobId = job.id || `job-${Date.now()}`;

  log("info", jobId, `Processing weather sync job`, {
    parkId: data.parkId,
    tenantId: data.tenantId,
    includeForecast: data.includeForecast,
    forceRefresh: data.forceRefresh,
    attempt: job.attemptsMade + 1,
  });

  // Check if API is configured
  if (!isWeatherApiConfigured()) {
    log("warn", jobId, "Weather API not configured, skipping job");
    return {
      recordsProcessed: 0,
      source: "none",
      latestDataTimestamp: new Date().toISOString(),
    };
  }

  try {
    // Get park details
    const park = await prisma.park.findUnique({
      where: { id: data.parkId },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        tenantId: true,
      },
    });

    if (!park) {
      log("error", jobId, `Park not found: ${data.parkId}`);
      throw new Error(`Park ${data.parkId} nicht gefunden`);
    }

    // Verify tenant
    if (park.tenantId !== data.tenantId) {
      log("error", jobId, `Tenant mismatch for park ${data.parkId}`);
      throw new Error("Tenant-Berechtigung fehlt");
    }

    const lat = decimalToNumber(park.latitude);
    const lon = decimalToNumber(park.longitude);

    if (!lat || !lon) {
      log("warn", jobId, `Park ${park.name} has no coordinates, skipping`);
      return {
        recordsProcessed: 0,
        source: "none",
        latestDataTimestamp: new Date().toISOString(),
      };
    }

    log("info", jobId, `Fetching weather for ${park.name}`, {
      lat,
      lon,
      includeForecast: data.includeForecast,
    });

    // Fetch weather data
    let recordsProcessed = 0;
    let latestTemperature: number | undefined;
    let latestWindSpeed: number | undefined;
    let latestWindDirection: number | undefined;

    if (data.includeForecast) {
      // Fetch current + forecast
      const result = await getWeatherWithForecast(lat, lon, 5);

      // Save current weather to database
      await saveWeatherToDatabase(data.parkId, result.current);
      recordsProcessed++;

      // Cache the result
      await setCachedWeather(data.parkId, {
        current: result.current,
        forecast: result.forecast,
        hourlyForecast: result.hourlyForecast,
      });

      latestTemperature = result.current.temperature;
      latestWindSpeed = result.current.windSpeed;
      latestWindDirection = result.current.windDirection;

      log("info", jobId, `Weather with forecast saved for ${park.name}`, {
        temperature: latestTemperature,
        windSpeed: latestWindSpeed,
        forecastDays: result.forecast.length,
      });
    } else {
      // Fetch current only
      const current = await getCurrentWeather(lat, lon);

      // Save to database
      await saveWeatherToDatabase(data.parkId, current);
      recordsProcessed++;

      // Cache current only
      await setCachedWeather(data.parkId, { current });

      latestTemperature = current.temperature;
      latestWindSpeed = current.windSpeed;
      latestWindDirection = current.windDirection;

      log("info", jobId, `Current weather saved for ${park.name}`, {
        temperature: latestTemperature,
        windSpeed: latestWindSpeed,
      });
    }

    // Update last sync time
    await setLastSyncTime(data.parkId);

    log("info", jobId, `Weather sync completed for ${park.name}`, {
      recordsProcessed,
    });

    return {
      recordsProcessed,
      latestTemperature,
      latestWindSpeed,
      latestWindDirection,
      source: "openweathermap",
      latestDataTimestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    log("error", jobId, `Weather sync failed`, {
      parkId: data.parkId,
      error: errorMessage,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts || 3,
    });

    // Rethrow for BullMQ retry logic
    throw error;
  }
}

// =============================================================================
// Worker Instance
// =============================================================================

let weatherWorker: Worker<WeatherJobData, WeatherJobResult> | null = null;

/**
 * Startet den Weather-Worker
 */
export function startWeatherWorker(): Worker<WeatherJobData, WeatherJobResult> {
  if (weatherWorker) {
    logger.info("Weather worker already running");
    return weatherWorker;
  }

  const connection = getRedisConnection();

  weatherWorker = new Worker<WeatherJobData, WeatherJobResult>(
    "weather",
    processWeatherJob,
    {
      connection,
      concurrency: 5,
      useWorkerThreads: false,
      // Rate-Limiting für OpenWeatherMap API (60 requests/minute free tier)
      limiter: {
        max: 60,
        duration: 60000,
      },
    }
  );

  // Event-Handler
  weatherWorker.on("completed", (job, result) => {
    const jobId = job.id || "unknown";
    log("info", jobId, "Job completed", {
      parkId: job.data.parkId,
      recordsProcessed: result.recordsProcessed,
      windSpeed: result.latestWindSpeed,
    });
  });

  weatherWorker.on("failed", (job, error) => {
    const jobId = job?.id || "unknown";
    log("error", jobId, "Job failed permanently", {
      parkId: job?.data?.parkId,
      error: error.message,
      attempts: job?.attemptsMade,
    });
  });

  weatherWorker.on("error", (error) => {
    logger.error({ err: error }, "Weather worker error");
  });

  weatherWorker.on("stalled", (jobId) => {
    log("warn", jobId, "Job stalled - will be retried");
  });

  logger.info({ concurrency: 5, rateLimit: "60/min" }, "Weather worker started");

  return weatherWorker;
}

/**
 * Stoppt den Weather-Worker gracefully
 */
export async function stopWeatherWorker(): Promise<void> {
  if (!weatherWorker) {
    logger.info("No weather worker running");
    return;
  }

  logger.info("Stopping weather worker...");

  try {
    await weatherWorker.close();
    weatherWorker = null;
    logger.info("Weather worker stopped gracefully");
  } catch (error) {
    logger.error({ err: error }, "Error stopping weather worker");
    throw error;
  }
}

/**
 * Prueft ob der Worker läuft
 */
export function isWeatherWorkerRunning(): boolean {
  return weatherWorker !== null && weatherWorker.isRunning();
}

/**
 * Gibt den Worker zurück (für Health-Checks)
 */
export function getWeatherWorker(): Worker<
  WeatherJobData,
  WeatherJobResult
> | null {
  return weatherWorker;
}

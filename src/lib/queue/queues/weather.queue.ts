/**
 * Weather Queue - BullMQ Queue for Weather Data Synchronization
 *
 * Handles asynchronous weather data fetching and synchronization
 * for wind parks using external weather APIs.
 */

import { Queue, JobsOptions } from 'bullmq';
import { getBullMQConnection } from '../connection';
import { jobLogger as logger } from "@/lib/logger";

/**
 * Weather job data structure
 */
export interface WeatherJobData {
  /** ID of the wind park to sync weather data for */
  parkId: string;
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** Optional: Specific date to fetch weather for (ISO string, defaults to now) */
  targetDate?: string;
  /** Optional: Include forecast data (next 7 days) */
  includeForecast?: boolean;
  /** Optional: Include historical data (past 30 days) */
  includeHistorical?: boolean;
  /** Optional: Force refresh even if recent data exists */
  forceRefresh?: boolean;
}

/**
 * Weather job result structure (returned by worker)
 */
export interface WeatherJobResult {
  /** Number of weather records created/updated */
  recordsProcessed: number;
  /** Latest temperature recorded (Celsius) */
  latestTemperature?: number;
  /** Latest wind speed recorded (m/s) */
  latestWindSpeed?: number;
  /** Latest wind direction (degrees) */
  latestWindDirection?: number;
  /** Data source used */
  source: string;
  /** Timestamp of the most recent data point */
  latestDataTimestamp: string;
}

/**
 * Queue name constant
 */
export const WEATHER_QUEUE_NAME = 'weather';

/**
 * Default job options for weather queue
 * Weather sync is less critical, so we use moderate settings
 */
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 3000, // Start with 3s, then 6s, 12s
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    count: 500,
  },
};

// Singleton queue instance
let weatherQueue: Queue<WeatherJobData, WeatherJobResult> | null = null;

/**
 * Get or create the weather queue instance
 */
export const getWeatherQueue = (): Queue<WeatherJobData, WeatherJobResult> => {
  if (!weatherQueue) {
    weatherQueue = new Queue<WeatherJobData, WeatherJobResult>(WEATHER_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });

    logger.info(`[Queue:${WEATHER_QUEUE_NAME}] Initialized`);
  }

  return weatherQueue;
};

/**
 * Enqueue a weather sync job
 *
 * @param jobData - Weather job data
 * @param options - Optional job-specific options to override defaults
 * @returns The created job
 *
 * @example
 * ```typescript
 * await enqueueWeatherSync({
 *   parkId: 'park-123',
 *   tenantId: 'tenant-456',
 *   includeForecast: true,
 * });
 * ```
 */
export const enqueueWeatherSync = async (
  jobData: WeatherJobData,
  options?: Partial<JobsOptions>
) => {
  const queue = getWeatherQueue();

  // Generate unique job ID
  // Use date-based key to allow multiple syncs per day but prevent rapid duplicates
  const dateKey = jobData.targetDate || new Date().toISOString().slice(0, 13); // Hour precision
  const jobId = `weather-${jobData.parkId}-${jobData.tenantId}-${dateKey}`;

  const job = await queue.add('sync-weather', jobData, {
    ...options,
    jobId,
  });

  logger.info(
    `[Queue:${WEATHER_QUEUE_NAME}] Job ${job.id} added: park ${jobData.parkId}`
  );

  return job;
};

/**
 * Schedule recurring weather sync for a park
 *
 * @param parkId - Wind park ID
 * @param tenantId - Tenant ID
 * @param intervalMinutes - Sync interval in minutes (default: 60)
 * @returns The created repeatable job
 *
 * @example
 * ```typescript
 * // Sync weather every hour
 * await scheduleWeatherSync('park-123', 'tenant-456', 60);
 * ```
 */
export const scheduleWeatherSync = async (
  parkId: string,
  tenantId: string,
  intervalMinutes: number = 60
) => {
  const queue = getWeatherQueue();

  const jobData: WeatherJobData = {
    parkId,
    tenantId,
    includeForecast: true,
  };

  const job = await queue.add('sync-weather', jobData, {
    repeat: {
      every: intervalMinutes * 60 * 1000, // Convert to milliseconds
    },
    jobId: `weather-recurring-${parkId}-${tenantId}`,
  });

  logger.info(
    `[Queue:${WEATHER_QUEUE_NAME}] Recurring job scheduled: park ${parkId} every ${intervalMinutes} minutes`
  );

  return job;
};

/**
 * Schedule daily weather sync with forecast at a specific time
 *
 * @param parkId - Wind park ID
 * @param tenantId - Tenant ID
 * @param hour - Hour of day to run (0-23, default: 6 = 6 AM)
 * @returns The created repeatable job
 */
export const scheduleDailyWeatherSync = async (
  parkId: string,
  tenantId: string,
  hour: number = 6
) => {
  const queue = getWeatherQueue();

  const jobData: WeatherJobData = {
    parkId,
    tenantId,
    includeForecast: true,
    includeHistorical: false,
  };

  // Cron: minute hour day month weekday
  const cronExpression = `0 ${hour} * * *`;

  const job = await queue.add('sync-weather', jobData, {
    repeat: {
      pattern: cronExpression,
    },
    jobId: `weather-daily-${parkId}-${tenantId}`,
  });

  logger.info(
    `[Queue:${WEATHER_QUEUE_NAME}] Daily job scheduled: park ${parkId} at ${hour}:00`
  );

  return job;
};

/**
 * Remove a scheduled recurring weather sync
 */
export const removeScheduledWeatherSync = async (
  parkId: string,
  tenantId: string
): Promise<boolean> => {
  const queue = getWeatherQueue();

  // Try to remove both recurring and daily jobs
  const recurringRemoved = await queue.removeRepeatableByKey(
    `sync-weather:${`weather-recurring-${parkId}-${tenantId}`}:::*`
  ).catch(() => false);

  const dailyRemoved = await queue.removeRepeatableByKey(
    `sync-weather:${`weather-daily-${parkId}-${tenantId}`}:::*`
  ).catch(() => false);

  const removed = recurringRemoved || dailyRemoved;

  if (removed) {
    logger.info(
      `[Queue:${WEATHER_QUEUE_NAME}] Scheduled job removed: park ${parkId}`
    );
  }

  return removed;
};

/**
 * Enqueue weather sync for all parks of a tenant
 * Useful for initial sync or recovery after downtime
 */
export const enqueueWeatherSyncForTenant = async (
  tenantId: string,
  parkIds: string[],
  options?: {
    includeForecast?: boolean;
    includeHistorical?: boolean;
    forceRefresh?: boolean;
  }
) => {
  const queue = getWeatherQueue();

  const bulkJobs = parkIds.map((parkId) => ({
    name: 'sync-weather',
    data: {
      parkId,
      tenantId,
      includeForecast: options?.includeForecast ?? true,
      includeHistorical: options?.includeHistorical ?? false,
      forceRefresh: options?.forceRefresh ?? false,
    } as WeatherJobData,
    opts: {
      jobId: `weather-${parkId}-${tenantId}-${new Date().toISOString().slice(0, 13)}`,
    },
  }));

  const addedJobs = await queue.addBulk(bulkJobs);

  logger.info(
    `[Queue:${WEATHER_QUEUE_NAME}] ${addedJobs.length} bulk jobs added for tenant ${tenantId}`
  );

  return addedJobs;
};

/**
 * Enqueue multiple weather sync jobs in bulk
 */
export const enqueueWeatherSyncBulk = async (
  jobs: Array<{ data: WeatherJobData; options?: Partial<JobsOptions> }>
) => {
  const queue = getWeatherQueue();

  const bulkJobs = jobs.map(({ data, options }) => {
    const dateKey = data.targetDate || new Date().toISOString().slice(0, 13);
    return {
      name: 'sync-weather',
      data,
      opts: {
        ...options,
        jobId: `weather-${data.parkId}-${data.tenantId}-${dateKey}`,
      },
    };
  });

  const addedJobs = await queue.addBulk(bulkJobs);

  logger.info(
    `[Queue:${WEATHER_QUEUE_NAME}] ${addedJobs.length} bulk jobs added`
  );

  return addedJobs;
};

/**
 * Close the weather queue connection
 */
export const closeWeatherQueue = async (): Promise<void> => {
  if (weatherQueue) {
    await weatherQueue.close();
    weatherQueue = null;
    logger.info(`[Queue:${WEATHER_QUEUE_NAME}] Closed`);
  }
};

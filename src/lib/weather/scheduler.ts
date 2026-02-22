/**
 * Weather Scheduler
 *
 * Manages scheduled weather sync jobs using BullMQ
 */

import { getWeatherQueue, scheduleWeatherSync, scheduleDailyWeatherSync, enqueueWeatherSyncForTenant, removeScheduledWeatherSync } from "../queue/queues/weather.queue";
import { prisma } from "../prisma";
import { logger } from "@/lib/logger";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_SYNC_INTERVAL_MINUTES = parseInt(process.env.WEATHER_SYNC_INTERVAL || "30");

// =============================================================================
// Scheduler Functions
// =============================================================================

/**
 * Schedule recurring weather sync for all parks of a tenant
 */
export async function scheduleWeatherSyncForTenant(
  tenantId: string,
  intervalMinutes: number = DEFAULT_SYNC_INTERVAL_MINUTES
): Promise<{
  scheduled: number;
  skipped: number;
}> {
  // Get all active parks with coordinates
  const parks = await prisma.park.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
    },
  });

  let scheduled = 0;
  let skipped = 0;

  for (const park of parks) {
    try {
      await scheduleWeatherSync(park.id, tenantId, intervalMinutes);
      scheduled++;
      logger.info(
        `[WeatherScheduler] Scheduled recurring sync for park ${park.name} every ${intervalMinutes} minutes`
      );
    } catch (error) {
      logger.error(
        { err: error },
        `[WeatherScheduler] Failed to schedule sync for park ${park.name}`
      );
      skipped++;
    }
  }

  return { scheduled, skipped };
}

/**
 * Schedule daily weather sync with forecast for all parks of a tenant
 */
export async function scheduleDailyWeatherSyncForTenant(
  tenantId: string,
  hour: number = 6
): Promise<{
  scheduled: number;
  skipped: number;
}> {
  // Get all active parks with coordinates
  const parks = await prisma.park.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
    },
  });

  let scheduled = 0;
  let skipped = 0;

  for (const park of parks) {
    try {
      await scheduleDailyWeatherSync(park.id, tenantId, hour);
      scheduled++;
      logger.info(
        `[WeatherScheduler] Scheduled daily sync for park ${park.name} at ${hour}:00`
      );
    } catch (error) {
      logger.error(
        { err: error },
        `[WeatherScheduler] Failed to schedule daily sync for park ${park.name}`
      );
      skipped++;
    }
  }

  return { scheduled, skipped };
}

/**
 * Remove all scheduled syncs for a tenant's parks
 */
export async function removeScheduledSyncsForTenant(
  tenantId: string
): Promise<number> {
  const parks = await prisma.park.findMany({
    where: {
      tenantId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  let removed = 0;

  for (const park of parks) {
    try {
      const wasRemoved = await removeScheduledWeatherSync(park.id, tenantId);
      if (wasRemoved) {
        removed++;
        logger.info(
          `[WeatherScheduler] Removed scheduled sync for park ${park.name}`
        );
      }
    } catch (error) {
      logger.error(
        { err: error },
        `[WeatherScheduler] Failed to remove sync for park ${park.name}`
      );
    }
  }

  return removed;
}

/**
 * Trigger immediate weather sync for all parks of a tenant
 */
export async function triggerImmediateSyncForTenant(
  tenantId: string,
  options?: {
    includeForecast?: boolean;
    includeHistorical?: boolean;
    forceRefresh?: boolean;
  }
): Promise<number> {
  // Get all active parks with coordinates
  const parks = await prisma.park.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
    },
  });

  const parkIds = parks.map((p) => p.id);

  if (parkIds.length === 0) {
    logger.info(`[WeatherScheduler] No parks to sync for tenant ${tenantId}`);
    return 0;
  }

  const jobs = await enqueueWeatherSyncForTenant(tenantId, parkIds, options);
  logger.info(
    `[WeatherScheduler] Triggered immediate sync for ${jobs.length} parks of tenant ${tenantId}`
  );

  return jobs.length;
}

/**
 * Schedule weather sync for a single park
 */
export async function scheduleWeatherSyncForPark(
  parkId: string,
  intervalMinutes: number = DEFAULT_SYNC_INTERVAL_MINUTES
): Promise<void> {
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    select: {
      id: true,
      name: true,
      tenantId: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!park) {
    throw new Error(`Park ${parkId} not found`);
  }

  if (!park.latitude || !park.longitude) {
    throw new Error(`Park ${park.name} has no coordinates`);
  }

  await scheduleWeatherSync(park.id, park.tenantId, intervalMinutes);
  logger.info(
    `[WeatherScheduler] Scheduled recurring sync for park ${park.name} every ${intervalMinutes} minutes`
  );
}

/**
 * Remove scheduled sync for a single park
 */
export async function removeScheduledSyncForPark(parkId: string): Promise<boolean> {
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    select: {
      id: true,
      name: true,
      tenantId: true,
    },
  });

  if (!park) {
    return false;
  }

  const removed = await removeScheduledWeatherSync(park.id, park.tenantId);
  if (removed) {
    logger.info(`[WeatherScheduler] Removed scheduled sync for park ${park.name}`);
  }
  return removed;
}

// =============================================================================
// Queue Status
// =============================================================================

/**
 * Get status of weather queue
 */
export async function getWeatherQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  repeatableJobs: number;
}> {
  const queue = getWeatherQueue();

  const [waiting, active, completed, failed, delayed, repeatableJobs] =
    await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getRepeatableJobs().then((jobs) => jobs.length),
    ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    repeatableJobs,
  };
}

/**
 * Get list of scheduled (repeatable) weather jobs
 */
export async function getScheduledWeatherJobs(): Promise<
  Array<{
    key: string;
    name: string;
    id: string | null;
    every: number | null;
    pattern: string | null;
    next: number;
  }>
> {
  const queue = getWeatherQueue();
  const repeatableJobs = await queue.getRepeatableJobs();

  return repeatableJobs.map((job) => ({
    key: job.key,
    name: job.name,
    id: job.id ?? null,
    every: typeof job.every === "number" ? job.every : null,
    pattern: job.pattern ?? null,
    next: job.next ?? 0,
  }));
}

/**
 * Pause weather queue
 */
export async function pauseWeatherQueue(): Promise<void> {
  const queue = getWeatherQueue();
  await queue.pause();
  logger.info("[WeatherScheduler] Weather queue paused");
}

/**
 * Resume weather queue
 */
export async function resumeWeatherQueue(): Promise<void> {
  const queue = getWeatherQueue();
  await queue.resume();
  logger.info("[WeatherScheduler] Weather queue resumed");
}

/**
 * Clean old completed/failed jobs
 */
export async function cleanWeatherQueue(
  grace: number = 3600000 // 1 hour in ms
): Promise<{
  completed: number;
  failed: number;
}> {
  const queue = getWeatherQueue();

  const [completed, failed] = await Promise.all([
    queue.clean(grace, 1000, "completed"),
    queue.clean(grace, 1000, "failed"),
  ]);

  logger.info(
    `[WeatherScheduler] Cleaned ${completed.length} completed and ${failed.length} failed jobs`
  );

  return {
    completed: completed.length,
    failed: failed.length,
  };
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize weather scheduling for all tenants
 * Call this on application startup
 */
export async function initializeWeatherScheduling(): Promise<void> {
  logger.info("[WeatherScheduler] Initializing weather scheduling...");

  // Get all active tenants
  const tenants = await prisma.tenant.findMany({
    where: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
    },
  });

  let totalScheduled = 0;

  for (const tenant of tenants) {
    try {
      const { scheduled } = await scheduleWeatherSyncForTenant(
        tenant.id,
        DEFAULT_SYNC_INTERVAL_MINUTES
      );
      totalScheduled += scheduled;
      logger.info(
        `[WeatherScheduler] Scheduled ${scheduled} parks for tenant ${tenant.name}`
      );
    } catch (error) {
      logger.error(
        { err: error },
        `[WeatherScheduler] Failed to initialize scheduling for tenant ${tenant.name}`
      );
    }
  }

  logger.info(
    `[WeatherScheduler] Initialization complete. ${totalScheduled} parks scheduled.`
  );
}

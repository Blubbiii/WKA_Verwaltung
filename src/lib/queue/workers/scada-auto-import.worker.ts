/**
 * SCADA Auto-Import Worker - Processes SCADA auto-import jobs
 *
 * Handles three job types:
 * - auto-import-all: Process all tenants with enabled auto-import
 * - auto-import-tenant: Process a specific tenant
 * - auto-import-location: Process a specific location (future use)
 *
 * Runs in the BullMQ worker process alongside other workers.
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '../connection';
import { prisma } from '../../prisma';
import { jobLogger } from '@/lib/logger';
import { runAutoImport } from '../../scada/auto-import-service';
import type {
  ScadaAutoImportJobData,
  ScadaAutoImportJobResult,
} from '../queues/scada-auto-import.queue';

// ---------------------------------------------------------------
// Logger
// ---------------------------------------------------------------

const logger = jobLogger.child({ component: 'scada-auto-import-worker' });

function log(
  level: 'info' | 'warn' | 'error',
  jobId: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const logData = { jobId, ...meta };
  if (level === 'error') {
    logger.error(logData, message);
  } else if (level === 'warn') {
    logger.warn(logData, message);
  } else {
    logger.info(logData, message);
  }
}

// ---------------------------------------------------------------
// Job Processor
// ---------------------------------------------------------------

/**
 * Process a SCADA auto-import job.
 */
async function processScadaAutoImportJob(
  job: Job<ScadaAutoImportJobData, ScadaAutoImportJobResult>,
): Promise<ScadaAutoImportJobResult> {
  const { data } = job;
  const jobId = job.id || `job-${Date.now()}`;
  const startTime = Date.now();

  log('info', jobId, 'Processing SCADA auto-import job', {
    type: data.type,
    tenantId: data.tenantId,
    manual: data.manual,
    attempt: job.attemptsMade + 1,
  });

  const result: ScadaAutoImportJobResult = {
    tenantsProcessed: 0,
    locationsChecked: 0,
    filesImported: 0,
    errors: 0,
    duration: 0,
  };

  try {
    switch (data.type) {
      case 'auto-import-all': {
        // Find all tenants that have at least one auto-import-enabled mapping
        const tenantsWithAutoImport = await prisma.scadaTurbineMapping.findMany({
          where: {
            autoImportEnabled: true,
            status: 'ACTIVE',
          },
          select: { tenantId: true },
          distinct: ['tenantId'],
        });

        log('info', jobId, `Found ${tenantsWithAutoImport.length} tenant(s) with auto-import enabled`);

        for (const { tenantId } of tenantsWithAutoImport) {
          try {
            log('info', jobId, `Processing tenant ${tenantId}`);

            const importResult = await runAutoImport(tenantId);

            result.tenantsProcessed++;
            result.locationsChecked += importResult.locationsChecked;
            result.filesImported += importResult.imported;
            result.errors += importResult.errors.length;

            log('info', jobId, `Tenant ${tenantId} completed`, {
              locationsChecked: importResult.locationsChecked,
              imported: importResult.imported,
              errors: importResult.errors.length,
            });
          } catch (err) {
            result.errors++;
            const errorMsg = err instanceof Error ? err.message : String(err);
            log('error', jobId, `Tenant ${tenantId} failed: ${errorMsg}`, { tenantId });
          }
        }
        break;
      }

      case 'auto-import-tenant': {
        if (!data.tenantId) {
          throw new Error('tenantId is required for auto-import-tenant job');
        }

        const importResult = await runAutoImport(data.tenantId);

        result.tenantsProcessed = 1;
        result.locationsChecked = importResult.locationsChecked;
        result.filesImported = importResult.imported;
        result.errors = importResult.errors.length;

        log('info', jobId, `Tenant auto-import completed`, {
          tenantId: data.tenantId,
          locationsChecked: importResult.locationsChecked,
          imported: importResult.imported,
          errors: importResult.errors.length,
        });
        break;
      }

      case 'auto-import-location': {
        if (!data.tenantId || !data.locationCode) {
          throw new Error('tenantId and locationCode are required for auto-import-location job');
        }

        // For a single location, we still use runAutoImport which handles
        // the full logic including log creation. The location filtering
        // happens via the enabled mappings.
        const importResult = await runAutoImport(data.tenantId);

        result.tenantsProcessed = 1;
        result.locationsChecked = importResult.locationsChecked;
        result.filesImported = importResult.imported;
        result.errors = importResult.errors.length;
        break;
      }

      default:
        throw new Error(`Unknown job type: ${data.type}`);
    }

    result.duration = Date.now() - startTime;

    log('info', jobId, 'SCADA auto-import job completed', {
      tenantsProcessed: result.tenantsProcessed,
      locationsChecked: result.locationsChecked,
      filesImported: result.filesImported,
      errors: result.errors,
      durationMs: result.duration,
    });

    return result;
  } catch (error) {
    result.duration = Date.now() - startTime;
    result.errors++;

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log('error', jobId, 'SCADA auto-import job failed', {
      error: errorMessage,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts || 3,
    });

    throw error;
  }
}

// ---------------------------------------------------------------
// Worker Instance
// ---------------------------------------------------------------

let scadaAutoImportWorker: Worker<ScadaAutoImportJobData, ScadaAutoImportJobResult> | null = null;

/**
 * Start the SCADA auto-import worker
 */
export function startScadaAutoImportWorker(): Worker<ScadaAutoImportJobData, ScadaAutoImportJobResult> {
  if (scadaAutoImportWorker) {
    logger.info('SCADA auto-import worker already running');
    return scadaAutoImportWorker;
  }

  const connection = getRedisConnection();

  scadaAutoImportWorker = new Worker<ScadaAutoImportJobData, ScadaAutoImportJobResult>(
    'scada-auto-import',
    processScadaAutoImportJob,
    {
      connection,
      concurrency: 1, // Only one auto-import at a time to avoid conflicts
      useWorkerThreads: false,
    },
  );

  // Event handlers
  scadaAutoImportWorker.on('completed', (job, result) => {
    const jobId = job.id || 'unknown';
    log('info', jobId, 'Job completed', {
      tenantsProcessed: result.tenantsProcessed,
      filesImported: result.filesImported,
      durationMs: result.duration,
    });
  });

  scadaAutoImportWorker.on('failed', (job, error) => {
    const jobId = job?.id || 'unknown';
    log('error', jobId, 'Job failed permanently', {
      error: error.message,
      attempts: job?.attemptsMade,
    });
  });

  scadaAutoImportWorker.on('error', (error) => {
    logger.error({ err: error }, 'SCADA auto-import worker error');
  });

  scadaAutoImportWorker.on('stalled', (jobId) => {
    log('warn', jobId, 'Job stalled - will be retried');
  });

  logger.info({ concurrency: 1 }, 'SCADA auto-import worker started');

  return scadaAutoImportWorker;
}

/**
 * Stop the SCADA auto-import worker gracefully
 */
export async function stopScadaAutoImportWorker(): Promise<void> {
  if (!scadaAutoImportWorker) {
    logger.info('No SCADA auto-import worker running');
    return;
  }

  logger.info('Stopping SCADA auto-import worker...');

  try {
    await scadaAutoImportWorker.close();
    scadaAutoImportWorker = null;
    logger.info('SCADA auto-import worker stopped gracefully');
  } catch (error) {
    logger.error({ err: error }, 'Error stopping SCADA auto-import worker');
    throw error;
  }
}

/**
 * Check if the worker is running
 */
export function isScadaAutoImportWorkerRunning(): boolean {
  return scadaAutoImportWorker !== null && scadaAutoImportWorker.isRunning();
}

/**
 * Get the worker instance (for health checks)
 */
export function getScadaAutoImportWorker(): Worker<ScadaAutoImportJobData, ScadaAutoImportJobResult> | null {
  return scadaAutoImportWorker;
}

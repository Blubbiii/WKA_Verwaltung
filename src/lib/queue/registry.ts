/**
 * Queue Registry - Central Management for all BullMQ Queues
 *
 * Provides a unified interface to access all application queues
 * for monitoring, job management, and statistics.
 */

import { Queue, Job, JobState, JobType } from 'bullmq';
import { getEmailQueue, EMAIL_QUEUE_NAME } from './queues/email.queue';
import { getPdfQueue, PDF_QUEUE_NAME } from './queues/pdf.queue';
import { getBillingQueue, BILLING_QUEUE_NAME } from './queues/billing.queue';
import { getWeatherQueue, WEATHER_QUEUE_NAME } from './queues/weather.queue';
import { getReportQueue, REPORT_QUEUE_NAME } from './queues/report.queue';
import { getReminderQueue, REMINDER_QUEUE_NAME } from './queues/reminder.queue';
import { getScadaAutoImportQueue, SCADA_AUTO_IMPORT_QUEUE_NAME } from './queues/scada-auto-import.queue';
import { getPaperlessQueue, PAPERLESS_QUEUE_NAME } from './queues/paperless.queue';
import { getInboxOcrQueue, INBOX_OCR_QUEUE_NAME } from './queues/inbox-ocr.queue';

/**
 * Queue metadata for registry
 */
export interface QueueInfo {
  name: string;
  displayName: string;
  description: string;
  getQueue: () => Queue;
}

/**
 * Job status types supported by the API
 */
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

/**
 * All valid job statuses for filtering
 */
export const VALID_JOB_STATUSES: JobStatus[] = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
];

/**
 * Registry of all application queues
 */
const queueRegistry: QueueInfo[] = [
  {
    name: EMAIL_QUEUE_NAME,
    displayName: 'E-Mail Queue',
    description: 'Versendet E-Mails asynchron mit Retry-Logik',
    getQueue: getEmailQueue,
  },
  {
    name: PDF_QUEUE_NAME,
    displayName: 'PDF Queue',
    description: 'Generiert PDFs für Rechnungen, Reports und Abstimmungsergebnisse',
    getQueue: getPdfQueue,
  },
  {
    name: BILLING_QUEUE_NAME,
    displayName: 'Billing Queue',
    description: 'Fuehrt automatische Abrechnungen basierend auf Regeln durch',
    getQueue: getBillingQueue,
  },
  {
    name: WEATHER_QUEUE_NAME,
    displayName: 'Weather Queue',
    description: 'Synchronisiert Wetterdaten für Windparks',
    getQueue: getWeatherQueue,
  },
  {
    name: REPORT_QUEUE_NAME,
    displayName: 'Report Queue',
    description: 'Generiert geplante Berichte automatisch nach Zeitplan',
    getQueue: getReportQueue as () => Queue,
  },
  {
    name: REMINDER_QUEUE_NAME,
    displayName: 'Reminder Queue',
    description: 'Prueft taeglich auf überfällige Rechnungen, auslaufende Verträge und offene Abrechnungen',
    getQueue: getReminderQueue as () => Queue,
  },
  {
    name: SCADA_AUTO_IMPORT_QUEUE_NAME,
    displayName: 'SCADA Auto-Import Queue',
    description: 'Automatischer Import neuer SCADA-Daten nach Zeitplan (taeglich/stuendlich/woechentlich)',
    getQueue: getScadaAutoImportQueue as () => Queue,
  },
  {
    name: PAPERLESS_QUEUE_NAME,
    displayName: 'Paperless Queue',
    description: 'Synchronisiert Dokumente mit Paperless-ngx zur Archivierung',
    getQueue: getPaperlessQueue as () => Queue,
  },
  {
    name: INBOX_OCR_QUEUE_NAME,
    displayName: 'Inbox OCR Queue',
    description: 'Verarbeitet hochgeladene Eingangsrechnungen per OCR (pdfjs + tesseract)',
    getQueue: getInboxOcrQueue as () => Queue,
  },
];

/**
 * Get all registered queues
 */
export const getAllQueues = (): QueueInfo[] => {
  return queueRegistry;
};

/**
 * Get a specific queue by name
 */
export const getQueueByName = (name: string): Queue | null => {
  const queueInfo = queueRegistry.find((q) => q.name === name);
  return queueInfo ? queueInfo.getQueue() : null;
};

/**
 * Get queue info by name
 */
export const getQueueInfoByName = (name: string): QueueInfo | null => {
  return queueRegistry.find((q) => q.name === name) || null;
};

/**
 * Queue statistics
 */
export interface QueueStats {
  name: string;
  displayName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

/**
 * Get statistics for a specific queue
 */
export const getQueueStats = async (queue: Queue, queueInfo: QueueInfo): Promise<QueueStats> => {
  const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ]);

  return {
    name: queueInfo.name,
    displayName: queueInfo.displayName,
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: isPaused,
  };
};

/**
 * Get statistics for all queues
 */
export const getAllQueueStats = async (): Promise<QueueStats[]> => {
  const statsPromises = queueRegistry.map((queueInfo) => {
    const queue = queueInfo.getQueue();
    return getQueueStats(queue, queueInfo);
  });

  return Promise.all(statsPromises);
};

/**
 * Aggregated statistics across all queues
 */
export interface AggregatedStats {
  queues: QueueStats[];
  totals: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
  };
  queueCount: number;
}

/**
 * Get aggregated statistics for all queues
 */
export const getAggregatedStats = async (): Promise<AggregatedStats> => {
  const queues = await getAllQueueStats();

  const totals = queues.reduce(
    (acc, queue) => ({
      waiting: acc.waiting + queue.waiting,
      active: acc.active + queue.active,
      completed: acc.completed + queue.completed,
      failed: acc.failed + queue.failed,
      delayed: acc.delayed + queue.delayed,
      total:
        acc.total +
        queue.waiting +
        queue.active +
        queue.completed +
        queue.failed +
        queue.delayed,
    }),
    { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: 0 }
  );

  return {
    queues,
    totals,
    queueCount: queues.length,
  };
};

/**
 * Serialized job data for API responses
 */
export interface SerializedJob {
  id: string;
  name: string;
  queueName: string;
  data: Record<string, unknown>;
  opts: {
    attempts: number;
    delay: number;
    priority: number;
  };
  progress: number | object;
  attemptsMade: number;
  processedOn: number | null;
  finishedOn: number | null;
  timestamp: number;
  failedReason: string | null;
  stacktrace: string[] | null;
  returnvalue: unknown;
  state: string;
}

/**
 * Serialize a Job for API response
 */
export const serializeJob = async (job: Job): Promise<SerializedJob> => {
  const state = await job.getState();

  // Normalize progress to number | object
  let normalizedProgress: number | object;
  if (typeof job.progress === 'number' || typeof job.progress === 'object') {
    normalizedProgress = job.progress as number | object;
  } else {
    normalizedProgress = 0;
  }

  return {
    id: job.id || '',
    name: job.name,
    queueName: job.queueName,
    data: job.data as Record<string, unknown>,
    opts: {
      attempts: job.opts.attempts || 1,
      delay: job.opts.delay || 0,
      priority: job.opts.priority || 0,
    },
    progress: normalizedProgress,
    attemptsMade: job.attemptsMade,
    processedOn: job.processedOn || null,
    finishedOn: job.finishedOn || null,
    timestamp: job.timestamp,
    failedReason: job.failedReason || null,
    stacktrace: job.stacktrace || null,
    returnvalue: job.returnvalue,
    state,
  };
};

/**
 * Get jobs from a queue with pagination
 */
export interface GetJobsOptions {
  queue: string;
  status?: JobStatus;
  page?: number;
  limit?: number;
}

export interface PaginatedJobs {
  jobs: SerializedJob[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

/**
 * Get paginated jobs from a queue
 */
export const getJobs = async (options: GetJobsOptions): Promise<PaginatedJobs> => {
  const { queue: queueName, status, page = 1, limit = 25 } = options;

  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" nicht gefunden`);
  }

  // Get jobs based on status filter
  const types: JobType[] = status ? [status] : ['waiting', 'active', 'completed', 'failed', 'delayed'];

  // Calculate pagination offsets
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  // Get total count for pagination
  let totalCount = 0;
  if (status) {
    switch (status) {
      case 'waiting':
        totalCount = await queue.getWaitingCount();
        break;
      case 'active':
        totalCount = await queue.getActiveCount();
        break;
      case 'completed':
        totalCount = await queue.getCompletedCount();
        break;
      case 'failed':
        totalCount = await queue.getFailedCount();
        break;
      case 'delayed':
        totalCount = await queue.getDelayedCount();
        break;
    }
  } else {
    const counts = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    totalCount = counts.reduce((a, b) => a + b, 0);
  }

  // Fetch jobs
  const jobs = await queue.getJobs(types, start, end, true);

  // Serialize jobs
  const serializedJobs = await Promise.all(jobs.map(serializeJob));

  return {
    jobs: serializedJobs,
    pagination: {
      total: totalCount,
      page,
      limit,
      pages: Math.ceil(totalCount / limit),
    },
  };
};

/**
 * Find a job by ID across all queues
 */
export const findJobById = async (
  jobId: string
): Promise<{ job: Job; queueInfo: QueueInfo } | null> => {
  for (const queueInfo of queueRegistry) {
    const queue = queueInfo.getQueue();
    const job = await queue.getJob(jobId);
    if (job) {
      return { job, queueInfo };
    }
  }
  return null;
};

/**
 * Find a job in a specific queue
 */
export const findJobInQueue = async (
  queueName: string,
  jobId: string
): Promise<{ job: Job; queueInfo: QueueInfo } | null> => {
  const queueInfo = getQueueInfoByName(queueName);
  if (!queueInfo) {
    return null;
  }

  const queue = queueInfo.getQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  return { job, queueInfo };
};

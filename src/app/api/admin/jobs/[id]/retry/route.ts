/**
 * Admin Jobs API - Retry Failed Job
 *
 * POST /api/admin/jobs/[id]/retry
 * Retry a failed job. Only allowed for jobs in 'failed' state.
 *
 * Query Parameters:
 * - queue: Queue name (optional, searches all queues if not provided)
 *
 * Access: SUPER_ADMIN, ADMIN only
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/withPermission';
import { apiLogger as logger } from "@/lib/logger";
import {
  findJobById,
  findJobInQueue,
  serializeJob,
} from '@/lib/queue/registry';

/**
 * Route params
 */
interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * Query parameter schema
 */
const querySchema = z.object({
  queue: z.string().optional(),
});

/**
 * POST /api/admin/jobs/[id]/retry
 * Retry a failed job
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Require admin access
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id: jobId } = await params;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = querySchema.parse({
      queue: searchParams.get('queue') || undefined,
    });

    // Find the job
    let result;
    if (queryParams.queue) {
      result = await findJobInQueue(queryParams.queue, jobId);
    } else {
      result = await findJobById(jobId);
    }

    if (!result) {
      return NextResponse.json(
        { error: `Job "${jobId}" nicht gefunden` },
        { status: 404 }
      );
    }

    const { job, queueInfo } = result;

    // Check job state - only allow retry of failed jobs
    const state = await job.getState();

    if (state !== 'failed') {
      return NextResponse.json(
        {
          error: `Job kann nicht erneut gestartet werden`,
          message: `Nur fehlgeschlagene Jobs koennen erneut gestartet werden. Der aktuelle Status ist "${state}".`,
          currentState: state,
          requiredState: 'failed',
        },
        { status: 400 }
      );
    }

    // Store original error info for logging
    const previousError = job.failedReason;
    const attemptsMade = job.attemptsMade;

    // Retry the job
    await job.retry();

    logger.info(
      `[API:admin/jobs/[id]/retry] Job ${jobId} retried in queue ${queueInfo.name} by user ${check.userId}. Previous attempts: ${attemptsMade}, Error: ${previousError}`
    );

    // Get updated job state
    const updatedJob = await serializeJob(job);

    return NextResponse.json({
      success: true,
      message: `Job "${jobId}" wurde zur Wiederholung eingeplant`,
      job: {
        id: jobId,
        queue: queueInfo.name,
        previousState: 'failed',
        newState: updatedJob.state,
        previousAttempts: attemptsMade,
        previousError: previousError,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Ungueltige Parameter',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    logger.error({ err: error }, '[API:admin/jobs/[id]/retry] Error');

    if (error instanceof Error) {
      // Handle specific BullMQ errors
      if (error.message.includes('not in a failed state')) {
        return NextResponse.json(
          {
            error: 'Job ist nicht im fehlgeschlagenen Status',
            message: 'Der Job wurde moeglicherweise bereits erneut gestartet.',
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Fehler beim erneuten Starten des Jobs' },
      { status: 500 }
    );
  }
}

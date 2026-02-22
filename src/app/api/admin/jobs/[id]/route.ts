/**
 * Admin Jobs API - Single Job Operations
 *
 * GET /api/admin/jobs/[id]
 * Get detailed information about a specific job.
 *
 * DELETE /api/admin/jobs/[id]
 * Remove/cancel a job. Only allowed for waiting or delayed jobs.
 *
 * Query Parameters (GET):
 * - queue: Queue name to search in (optional, searches all if not provided)
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
  type SerializedJob,
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
 * Query parameter schema for GET
 */
const getQuerySchema = z.object({
  queue: z.string().optional(),
});

/**
 * Detailed job response with additional metadata
 */
interface DetailedJobResponse {
  job: SerializedJob;
  queue: {
    name: string;
    displayName: string;
  };
  canDelete: boolean;
  canRetry: boolean;
}

/**
 * GET /api/admin/jobs/[id]
 * Get detailed job information
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Require admin access
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id: jobId } = await params;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = getQuerySchema.parse({
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

    // Serialize job data
    const serializedJob = await serializeJob(job);

    // Determine available actions
    const canDelete = ['waiting', 'delayed'].includes(serializedJob.state);
    const canRetry = serializedJob.state === 'failed';

    const response: DetailedJobResponse = {
      job: serializedJob,
      queue: {
        name: queueInfo.name,
        displayName: queueInfo.displayName,
      },
      canDelete,
      canRetry,
    };

    return NextResponse.json(response);
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

    logger.error({ err: error }, '[API:admin/jobs/[id]] GET Error');

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Fehler beim Laden des Jobs' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/jobs/[id]
 * Remove/cancel a job (only waiting or delayed jobs)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Require admin access
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id: jobId } = await params;

    // Parse optional queue parameter from body or query
    const { searchParams } = new URL(request.url);
    const queueName = searchParams.get('queue');

    // Find the job
    let result;
    if (queueName) {
      result = await findJobInQueue(queueName, jobId);
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

    // Check job state - only allow deletion of waiting/delayed jobs
    const state = await job.getState();

    if (!['waiting', 'delayed'].includes(state)) {
      return NextResponse.json(
        {
          error: `Job kann nicht geloescht werden`,
          message: `Jobs im Status "${state}" koennen nicht geloescht werden. Nur wartende oder verzoegerte Jobs koennen entfernt werden.`,
          currentState: state,
          allowedStates: ['waiting', 'delayed'],
        },
        { status: 400 }
      );
    }

    // Remove the job
    await job.remove();

    logger.info(
      `[API:admin/jobs/[id]] Job ${jobId} deleted from queue ${queueInfo.name} by user ${check.userId}`
    );

    return NextResponse.json({
      success: true,
      message: `Job "${jobId}" wurde erfolgreich geloescht`,
      deletedJob: {
        id: jobId,
        queue: queueInfo.name,
        previousState: state,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[API:admin/jobs/[id]] DELETE Error');

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Fehler beim Loeschen des Jobs' },
      { status: 500 }
    );
  }
}

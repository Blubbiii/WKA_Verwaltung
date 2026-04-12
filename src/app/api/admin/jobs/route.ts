/**
 * Admin Jobs API - List Jobs
 *
 * GET /api/admin/jobs
 * Lists all jobs across queues with filtering and pagination.
 *
 * Query Parameters:
 * - queue: Filter by queue name (optional)
 * - status: Filter by job status (waiting, active, completed, failed, delayed)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25, max: 100)
 *
 * Access: SUPER_ADMIN, ADMIN only
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/withPermission';
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";
import { PAGE_SIZE_ADMIN } from "@/lib/config/pagination";
import {
  getAllQueues,
  getJobs,
  VALID_JOB_STATUSES,
  type JobStatus,
  type SerializedJob,
} from '@/lib/queue/registry';

/**
 * Query parameter validation schema
 */
const querySchema = z.object({
  queue: z.string().optional(),
  status: z.enum(['waiting', 'active', 'completed', 'failed', 'delayed']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(PAGE_SIZE_ADMIN),
});

/**
 * Response type for job listing
 */
interface JobListResponse {
  jobs: SerializedJob[];
  pagination: {
    total: number;
    page: number;
    pages: number;
    limit: number;
  };
  filters: {
    queue: string | null;
    status: JobStatus | null;
    availableQueues: string[];
    availableStatuses: JobStatus[];
  };
}

/**
 * GET /api/admin/jobs
 * List jobs with optional filtering by queue and status
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin access
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      queue: searchParams.get('queue') || undefined,
      status: searchParams.get('status') || undefined,
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || PAGE_SIZE_ADMIN,
    });

    // Get available queues
    const availableQueues = getAllQueues().map((q) => q.name);

    // Validate queue name if provided
    if (params.queue && !availableQueues.includes(params.queue)) {
      return apiError("NOT_FOUND", 400, {
        message: `Queue "${params.queue}" nicht gefunden`,
        details: { availableQueues },
      });
    }

    // If a specific queue is requested, get jobs from that queue
    if (params.queue) {
      const result = await getJobs({
        queue: params.queue,
        status: params.status,
        page: params.page,
        limit: params.limit,
      });

      const response: JobListResponse = {
        jobs: result.jobs,
        pagination: result.pagination,
        filters: {
          queue: params.queue,
          status: params.status || null,
          availableQueues,
          availableStatuses: VALID_JOB_STATUSES,
        },
      };

      return NextResponse.json(response);
    }

    // No specific queue - get jobs from all queues
    const allQueues = getAllQueues();
    const allJobsResults = await Promise.all(
      allQueues.map((q) =>
        getJobs({
          queue: q.name,
          status: params.status,
          page: 1,
          limit: 1000, // Get more to allow cross-queue pagination
        })
      )
    );

    // Combine all jobs
    let allJobs: SerializedJob[] = [];
    let totalCount = 0;

    for (const result of allJobsResults) {
      allJobs = allJobs.concat(result.jobs);
      totalCount += result.pagination.total;
    }

    // Sort by timestamp descending (newest first)
    allJobs.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination to combined results
    const start = (params.page - 1) * params.limit;
    const paginatedJobs = allJobs.slice(start, start + params.limit);
    const totalPages = Math.ceil(totalCount / params.limit);

    const response: JobListResponse = {
      jobs: paginatedJobs,
      pagination: {
        total: totalCount,
        page: params.page,
        pages: totalPages,
        limit: params.limit,
      },
      filters: {
        queue: null,
        status: params.status || null,
        availableQueues,
        availableStatuses: VALID_JOB_STATUSES,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, "Fehler beim Laden der Jobs");
  }
}

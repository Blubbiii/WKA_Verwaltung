/**
 * Admin Jobs Stats API - Queue Statistics
 *
 * GET /api/admin/jobs/stats
 * Returns statistics for all queues including job counts by status.
 *
 * Access: SUPER_ADMIN, ADMIN only
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/withPermission';
import { getAggregatedStats, type AggregatedStats } from '@/lib/queue/registry';
import { isRedisHealthy } from '@/lib/queue/connection';
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

/**
 * Extended stats response with health info
 */
interface StatsResponse extends AggregatedStats {
  healthy: boolean;
  timestamp: string;
}

/**
 * GET /api/admin/jobs/stats
 * Get statistics for all queues
 */
export async function GET(_request: NextRequest) {
  try {
    // Require admin access
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // Check Redis health first
    const healthy = await isRedisHealthy();

    if (!healthy) {
      return NextResponse.json(
        {
          error: 'Redis-Verbindung nicht verfügbar',
          healthy: false,
          queues: [],
          totals: {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            total: 0,
          },
          queueCount: 0,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    // Get aggregated stats from all queues
    const stats = await getAggregatedStats();

    const response: StatsResponse = {
      ...stats,
      healthy: true,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ err: error }, '[API:admin/jobs/stats] Error');

    if (error instanceof Error) {
      // Check for Redis connection errors
      if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('Redis')
      ) {
        return NextResponse.json(
          {
            error: 'Redis-Verbindung fehlgeschlagen',
            healthy: false,
            queues: [],
            totals: {
              waiting: 0,
              active: 0,
              completed: 0,
              failed: 0,
              delayed: 0,
              total: 0,
            },
            queueCount: 0,
            timestamp: new Date().toISOString(),
          },
          { status: 503 }
        );
      }

      return apiError("INTERNAL_ERROR", undefined, { message: error.message });
    }

    return apiError("FETCH_FAILED", undefined, { message: 'Fehler beim Laden der Queue-Statistiken' });
  }
}

/**
 * Manual trigger for the tus + SCADA-staging garbage collection.
 * Requires Superadmin auth. The same GC logic runs every 6h via BullMQ cron
 * (`tus-gc.queue`) — this endpoint is for debugging or one-off cleanups.
 */

import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { runTusGarbageCollection } from "@/lib/tus/gc";

export async function POST() {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const result = await runTusGarbageCollection();
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "tus GC failed");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler beim tus-GC",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

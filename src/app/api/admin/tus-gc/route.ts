/**
 * Garbage-collect abandoned tus uploads and stale SCADA staging directories.
 *
 * Meant to be called by a scheduled job (cron / BullMQ) every few hours.
 * Requires Superadmin auth so it can also be triggered manually from the
 * admin console for debugging.
 *
 * Two things get cleaned:
 *   1. tus datastore: any upload whose `Upload-Expires` header has passed
 *      (24h default) is removed via `server.cleanUpExpiredUploads()`.
 *   2. SCADA staging tree: session dirs older than 24h that either are empty
 *      or whose files have been sitting there without being finalized (the
 *      user closed the browser mid-batch). Files that got moved out by
 *      `startImport(cleanupDir)` leave behind empty dirs — those get GC'd
 *      here too.
 */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { getTusServer } from "@/lib/tus/server";
import { TUS_SCADA_STAGING_DIR, TUS_EXPIRATION_MS } from "@/lib/tus/config";

interface GcResult {
  tusExpiredCount: number;
  scadaSessionsRemoved: number;
  scadaTenantsScanned: number;
  errors: string[];
}

async function rmDirSafely(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

async function gcScadaStaging(): Promise<{
  sessionsRemoved: number;
  tenantsScanned: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let sessionsRemoved = 0;
  let tenantsScanned = 0;

  let tenantDirs: string[];
  try {
    tenantDirs = await fs.readdir(TUS_SCADA_STAGING_DIR);
  } catch {
    // Staging dir doesn't exist yet — nothing to GC
    return { sessionsRemoved: 0, tenantsScanned: 0, errors };
  }

  const now = Date.now();
  const cutoff = now - TUS_EXPIRATION_MS;

  for (const tenantId of tenantDirs) {
    const tenantDir = path.join(TUS_SCADA_STAGING_DIR, tenantId);
    let sessionDirs: string[];
    try {
      const stat = await fs.stat(tenantDir);
      if (!stat.isDirectory()) continue;
      sessionDirs = await fs.readdir(tenantDir);
    } catch (err) {
      errors.push(`readdir ${tenantDir}: ${(err as Error).message}`);
      continue;
    }
    tenantsScanned++;

    for (const sessionId of sessionDirs) {
      const sessionDir = path.join(tenantDir, sessionId);
      try {
        const stat = await fs.stat(sessionDir);
        if (!stat.isDirectory()) continue;
        if (stat.mtimeMs > cutoff) continue; // still fresh — skip

        await rmDirSafely(sessionDir);
        sessionsRemoved++;
      } catch (err) {
        errors.push(`gc ${sessionDir}: ${(err as Error).message}`);
      }
    }

    // If tenant dir is now empty, remove it too
    try {
      const remaining = await fs.readdir(tenantDir);
      if (remaining.length === 0) await rmDirSafely(tenantDir);
    } catch {
      /* ignore */
    }
  }

  return { sessionsRemoved, tenantsScanned, errors };
}

export async function POST() {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const result: GcResult = {
      tusExpiredCount: 0,
      scadaSessionsRemoved: 0,
      scadaTenantsScanned: 0,
      errors: [],
    };

    // 1) tus datastore GC — built-in via server.cleanUpExpiredUploads()
    try {
      const server = await getTusServer();
      result.tusExpiredCount = await server.cleanUpExpiredUploads();
    } catch (err) {
      result.errors.push(`tus cleanUpExpiredUploads: ${(err as Error).message}`);
    }

    // 2) SCADA staging GC
    const scada = await gcScadaStaging();
    result.scadaSessionsRemoved = scada.sessionsRemoved;
    result.scadaTenantsScanned = scada.tenantsScanned;
    result.errors.push(...scada.errors);

    logger.info({ result }, "tus GC done");
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "tus GC failed");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler beim tus-GC",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

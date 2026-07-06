/**
 * tus garbage collection — pure library functions that both the HTTP endpoint
 * (`/api/admin/tus-gc`) and the BullMQ cron worker (`tus-gc.worker`) call.
 *
 * Two cleanup passes:
 *   1. tus datastore — expired resumable uploads (24h default)
 *   2. SCADA staging tree — session dirs older than 24h
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "@/lib/logger";
import { getTusServer } from "./server";
import { TUS_SCADA_STAGING_DIR, TUS_EXPIRATION_MS } from "./config";

const gcLogger = logger.child({ module: "tus-gc" });

export interface TusGcResult {
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

  const cutoff = Date.now() - TUS_EXPIRATION_MS;

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

export async function runTusGarbageCollection(): Promise<TusGcResult> {
  const result: TusGcResult = {
    tusExpiredCount: 0,
    scadaSessionsRemoved: 0,
    scadaTenantsScanned: 0,
    errors: [],
  };

  // 1) tus datastore GC — built-in
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

  gcLogger.info({ result }, "tus GC done");
  return result;
}

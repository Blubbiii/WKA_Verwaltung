/**
 * Finalize a tus SCADA upload batch.
 *
 * Called by the Uppy client once ALL files in a batch have finished uploading
 * to the tus endpoint. Scans the per-session staging directory built by
 * `dispatchScadaUpload`, groups by (locationCode, fileType) and starts one
 * ScadaImportLog + startImport() per group.
 *
 * Directory layout produced by the dispatcher:
 *   {STAGING}/{tenantId}/{sessionId}/{LOC_CODE}/{FILETYPE}/{files…}
 *
 * NOTE: This endpoint is idempotent within a session — if the client retries
 * finalize after a partial failure, groups that are still on disk get picked
 * up again. Groups whose files were already moved/consumed by a previous
 * startImport are skipped naturally because the dir will be empty.
 */

import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { TUS_SCADA_STAGING_DIR } from "@/lib/tus/config";
import {
  startImport,
  isValidFileType,
  type ScadaFileType,
} from "@/lib/scada/import-service";

const finalizeSchema = z.object({
  sessionId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/, "Ungültige sessionId"),
});

interface StartedImport {
  locationCode: string;
  fileType: string;
  importLogId: string;
  fileCount: number;
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = finalizeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: parsed.error.issues,
      });
    }
    const { sessionId } = parsed.data;
    const tenantId = check.tenantId!;

    const tenantRoot = path.resolve(path.join(TUS_SCADA_STAGING_DIR, tenantId));
    const sessionRoot = path.resolve(path.join(tenantRoot, sessionId));

    // Defense-in-depth: even though the zod-regex on sessionId forbids `/`
    // and `..`, we double-check the resolved path stays inside the tenant
    // sandbox. Any traversal attempt is rejected here.
    if (!sessionRoot.startsWith(tenantRoot + path.sep) && sessionRoot !== tenantRoot) {
      logger.warn(
        { tenantId, sessionId, sessionRoot, tenantRoot },
        "SCADA-tus finalize: path-traversal attempt blocked"
      );
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige sessionId",
      });
    }

    // Session dir may not exist if the batch had no successful uploads
    let sessionExists = true;
    try {
      await fs.access(sessionRoot);
    } catch {
      sessionExists = false;
    }
    if (!sessionExists) {
      return NextResponse.json({ imports: [], totalFiles: 0 }, { status: 200 });
    }

    // {sessionRoot}/{LOC_CODE}/{FILETYPE}/{files}
    const locDirs = await fs.readdir(sessionRoot, { withFileTypes: true });
    const imports: StartedImport[] = [];
    let totalFiles = 0;

    for (const locDirent of locDirs) {
      if (!locDirent.isDirectory()) continue;
      const locationCode = locDirent.name;
      if (!locationCode.startsWith("Loc_")) continue;

      const locDir = path.join(sessionRoot, locationCode);
      const fileTypeDirs = await fs.readdir(locDir, { withFileTypes: true });

      for (const ftDirent of fileTypeDirs) {
        if (!ftDirent.isDirectory()) continue;
        const fileType = ftDirent.name.toUpperCase();
        if (!isValidFileType(fileType)) {
          logger.warn(
            { tenantId, sessionId, locationCode, fileType },
            "SCADA-tus-finalize: ungültiger fileType übersprungen"
          );
          continue;
        }

        const typeDir = path.join(locDir, ftDirent.name);
        const files = await fs.readdir(typeDir);
        if (files.length === 0) continue;

        const filePaths = files.map((f) => path.join(typeDir, f));

        // Skip if an import for the exact same tuple is already RUNNING —
        // the current files will be picked up by the next manual retrigger.
        const running = await prisma.scadaImportLog.findFirst({
          where: { tenantId, locationCode, fileType, status: "RUNNING" },
        });
        if (running) {
          imports.push({
            locationCode,
            fileType,
            importLogId: running.id,
            fileCount: filePaths.length,
          });
          totalFiles += filePaths.length;
          continue;
        }

        const log = await prisma.scadaImportLog.create({
          data: {
            tenantId,
            locationCode,
            fileType,
            status: "RUNNING",
            filesTotal: filePaths.length,
          },
        });

        // Fire-and-forget — import runs in background, UI polls the log
        startImport({
          tenantId,
          locationCode,
          fileType: fileType as ScadaFileType,
          basePath: typeDir,
          importLogId: log.id,
          filePaths,
          cleanupDir: typeDir,
        }).catch(async (err: unknown) => {
          logger.error({ err, importLogId: log.id }, "SCADA-tus Import fehlgeschlagen");
          await prisma.scadaImportLog.update({
            where: { id: log.id },
            data: {
              status: "FAILED",
              completedAt: new Date(),
              errorDetails: { message: String(err) },
            },
          });
        });

        imports.push({
          locationCode,
          fileType,
          importLogId: log.id,
          fileCount: filePaths.length,
        });
        totalFiles += filePaths.length;
      }
    }

    // Best-effort: remove now-empty session root after imports were spawned.
    // The individual typeDirs will be cleaned by startImport(cleanupDir).
    // We can't rm the sessionRoot yet because its children still hold files.
    // A separate scheduled job GCs orphaned session roots.

    return NextResponse.json({ imports, totalFiles, sessionId }, { status: 202 });
  } catch (error) {
    logger.error({ err: error }, "Fehler bei SCADA-tus finalize");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler beim Finalisieren des SCADA-Uploads",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

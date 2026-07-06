/**
 * Dispatcher for SCADA uploads from the tus server.
 *
 * Called from `onUploadFinish` for each completed file. Moves the file out of
 * the tus staging into a per-session staging tree grouped by locationCode +
 * fileType so the SCADA import service can later pick up whole batches.
 *
 *   {TUS_SCADA_STAGING_DIR}/{tenantId}/{sessionId}/{LOC_CODE}/{FILETYPE}/…
 *
 * The client (Uppy) generates a sessionId (UUID) once at the start of a batch
 * and attaches it as `sessionId` metadata to every file it uploads. After the
 * batch is done it calls POST /api/energy/scada/tus/finalize which starts one
 * import job per (locationCode, fileType) tuple in that session dir.
 */

import * as path from "path";
import * as fs from "fs/promises";
import { logger } from "@/lib/logger";
import { TUS_SCADA_STAGING_DIR } from "@/lib/tus/config";
import { SCADA_EXTENSIONS_SET } from "@/lib/scada/file-types";

const dispatchLogger = logger.child({ module: "tus-scada-dispatcher" });

export interface ScadaDispatchInput {
  /** tus upload UUID */
  uploadId: string;
  /** absolute path where tus wrote the completed file */
  tusFilePath: string;
  /** metadata as sent by the client */
  metadata: Record<string, string | null>;
  /** authenticated user's tenant (from onUploadCreate auth check) */
  tenantId: string;
}

export interface ScadaDispatchResult {
  ok: boolean;
  reason?: string;
  stagedPath?: string;
}

/**
 * Basic metadata validation shared with onUploadCreate so we reject invalid
 * uploads before any chunks are stored.
 */
export function validateScadaMetadata(
  metadata: Record<string, string | null>
): { ok: true } | { ok: false; reason: string } {
  const { filename, locationCode, sessionId } = metadata;

  if (!filename) return { ok: false, reason: "filename fehlt in metadata" };
  if (!locationCode || !locationCode.startsWith("Loc_")) {
    return { ok: false, reason: "locationCode fehlt oder ist ungültig (muss mit 'Loc_' beginnen)" };
  }
  if (!sessionId || !/^[a-zA-Z0-9_-]{8,64}$/.test(sessionId)) {
    return { ok: false, reason: "sessionId fehlt oder ist ungültig" };
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!SCADA_EXTENSIONS_SET.has(ext)) {
    return { ok: false, reason: `Extension .${ext} ist keine gültige SCADA-Extension` };
  }

  return { ok: true };
}

export async function dispatchScadaUpload(
  input: ScadaDispatchInput
): Promise<ScadaDispatchResult> {
  const { uploadId, tusFilePath, metadata, tenantId } = input;

  const validation = validateScadaMetadata(metadata);
  if (!validation.ok) {
    dispatchLogger.warn({ uploadId, reason: validation.reason }, "SCADA-Dispatch abgelehnt");
    return { ok: false, reason: validation.reason };
  }

  const filename = metadata.filename!;
  const locationCode = metadata.locationCode!;
  const sessionId = metadata.sessionId!;

  const ext = filename.split(".").pop()!.toLowerCase();
  const fileType = ext.toUpperCase();

  const targetDir = path.join(
    TUS_SCADA_STAGING_DIR,
    tenantId,
    sessionId,
    locationCode,
    fileType
  );
  await fs.mkdir(targetDir, { recursive: true });

  const safeName = path.basename(filename);
  const targetPath = path.join(targetDir, safeName);

  // Move file out of tus storage into staging area
  await fs.rename(tusFilePath, targetPath);

  // tus also writes a `.json` sidecar next to the chunk file — clean it up
  try {
    await fs.unlink(tusFilePath + ".json");
  } catch {
    /* sidecar may not exist depending on datastore version — ignore */
  }

  dispatchLogger.info(
    { uploadId, tenantId, sessionId, locationCode, fileType, targetPath },
    "SCADA-File in Staging verschoben"
  );

  return { ok: true, stagedPath: targetPath };
}

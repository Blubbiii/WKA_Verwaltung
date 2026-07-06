/**
 * Central tus (resumable upload) server instance.
 *
 * One shared instance across all requests so the MemoryLocker actually
 * synchronizes concurrent uploads within a single Node process. In a
 * multi-instance Docker setup a distributed locker (Redis) would be
 * required — WPM currently runs single-container so MemoryLocker is fine.
 *
 * The instance is lazily initialized because the FileStore constructor
 * synchronously ensures its directory exists, and we don't want that
 * side effect to run at module import time (Next.js may import this file
 * during build phases where /tmp is not writable).
 */

import * as fs from "fs/promises";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { logger } from "@/lib/logger";
import {
  TUS_UPLOAD_DIR,
  TUS_ROUTE_PATH,
  TUS_MAX_SIZE_BYTES,
} from "./config";
import {
  dispatchScadaUpload,
  validateScadaMetadata,
} from "./dispatchers/scada";
import {
  dispatchS3Upload,
  validateS3Metadata,
} from "./dispatchers/s3";
import { checkStorageLimit } from "@/lib/storage-tracking";
import { auth } from "@/lib/auth";
import * as path from "path";

const tusLogger = logger.child({ module: "tus-server" });

let cachedServer: Server | null = null;

/**
 * Get (and lazily construct) the shared tus Server instance.
 */
export async function getTusServer(): Promise<Server> {
  if (cachedServer) return cachedServer;

  // Ensure the upload directory exists before FileStore touches it
  await fs.mkdir(TUS_UPLOAD_DIR, { recursive: true });

  const datastore = new FileStore({ directory: TUS_UPLOAD_DIR });

  cachedServer = new Server({
    path: TUS_ROUTE_PATH,
    datastore,
    maxSize: TUS_MAX_SIZE_BYTES,
    respectForwardedHeaders: true,
    // Cap how frequently the POST_RECEIVE event fires per upload so we don't
    // log-spam once per received chunk on huge files. 5s is enough for UI
    // progress polling anyway.
    postReceiveInterval: 5000,

    /**
     * Runs BEFORE any file bytes are received. This is the correct place to
     * (a) verify the user is authenticated and (b) validate metadata sent by
     * the client. If we throw here, the tus POST returns 4xx and no chunk
     * storage is ever created — cheap rejection.
     */
    async onUploadCreate(_req, upload) {
      // Auth check — auth() reads cookies from the AsyncLocalStorage set by
      // the Next.js Route Handler, so no explicit request forwarding needed.
      const session = await auth();
      if (!session?.user?.id) {
        throw {
          status_code: 401,
          body: JSON.stringify({ code: "UNAUTHORIZED", error: "Nicht authentifiziert" }),
        };
      }
      const tenantId = session.user.tenantId;
      if (!tenantId) {
        throw {
          status_code: 403,
          body: JSON.stringify({ code: "FORBIDDEN", error: "Kein Mandant in Session" }),
        };
      }

      const meta = upload.metadata ?? {};

      // Reject upload metadata with absurdly long values before doing any
      // real work — protects against Header-DoS via Upload-Metadata.
      const MAX_METADATA_VALUE_LEN = 512;
      for (const [key, value] of Object.entries(meta)) {
        if (typeof value === "string" && value.length > MAX_METADATA_VALUE_LEN) {
          throw {
            status_code: 400,
            body: JSON.stringify({
              code: "VALIDATION_FAILED",
              error: `Metadata-Feld ${key} zu lang (max ${MAX_METADATA_VALUE_LEN} Zeichen)`,
            }),
          };
        }
      }

      const uploadType = meta.uploadType;

      if (uploadType === "scada") {
        const validation = validateScadaMetadata(meta);
        if (!validation.ok) {
          throw {
            status_code: 400,
            body: JSON.stringify({
              code: "VALIDATION_FAILED",
              error: validation.reason,
            }),
          };
        }
      } else if (uploadType === "s3") {
        // Storage-limit pre-check with the size the client announced via
        // Upload-Length (tus fills upload.size before onUploadCreate runs).
        const size = upload.size ?? 0;
        const validation = validateS3Metadata(meta, size);
        if (!validation.ok) {
          throw {
            status_code: 400,
            body: JSON.stringify({
              code: "VALIDATION_FAILED",
              error: validation.reason,
            }),
          };
        }
        if (size > 0) {
          const limit = await checkStorageLimit(tenantId, size);
          if (!limit.allowed) {
            throw {
              status_code: 413,
              body: JSON.stringify({
                code: "QUOTA_EXCEEDED",
                error: `Speicherlimit erreicht (${limit.info.usedFormatted} / ${limit.info.limitFormatted})`,
              }),
            };
          }
        }
      } else {
        throw {
          status_code: 400,
          body: JSON.stringify({
            code: "BAD_REQUEST",
            error: `Unbekannter uploadType: ${uploadType ?? "(fehlt)"}`,
          }),
        };
      }

      // Persist the resolved tenantId into metadata so onUploadFinish can
      // use it without another auth() roundtrip (and so the dispatch is
      // always tenant-scoped even if the client tries to spoof).
      return {
        metadata: {
          ...meta,
          tenantId,
        },
      };
    },

    /**
     * Runs AFTER the last byte has been received and the file is fully
     * assembled. We move the completed file into a per-tenant staging area
     * where the SCADA import service can later pick up a whole batch.
     *
     * IMPORTANT: We do NOT start the actual import here. The client-side
     * Uppy batch may have multiple files still in flight — starting an
     * import per file would race and produce broken state. Instead the
     * client calls POST /api/energy/scada/tus/finalize once all uploads
     * in the batch are done.
     */
    async onUploadFinish(_req, upload) {
      const meta = upload.metadata ?? {};
      const tenantId = meta.tenantId;
      if (!tenantId) {
        tusLogger.error({ uploadId: upload.id }, "tenantId fehlt in metadata (server bug)");
        throw {
          status_code: 500,
          body: JSON.stringify({ code: "INTERNAL_ERROR", error: "tenantId fehlt in Server-Metadata" }),
        };
      }

      // FileStore writes each upload as `${directory}/${upload.id}`
      const tusFilePath = path.join(TUS_UPLOAD_DIR, upload.id);

      if (meta.uploadType === "scada") {
        const result = await dispatchScadaUpload({
          uploadId: upload.id,
          tusFilePath,
          metadata: meta,
          tenantId,
        });
        if (!result.ok) {
          tusLogger.warn({ uploadId: upload.id, reason: result.reason }, "SCADA-Dispatch failed");
          throw {
            status_code: 400,
            body: JSON.stringify({
              code: "PROCESS_FAILED",
              error: result.reason ?? "SCADA-Dispatch fehlgeschlagen",
            }),
          };
        }
      } else if (meta.uploadType === "s3") {
        const result = await dispatchS3Upload({
          uploadId: upload.id,
          tusFilePath,
          fileSize: upload.size ?? 0,
          metadata: meta,
          tenantId,
        });
        if (!result.ok) {
          tusLogger.warn({ uploadId: upload.id, reason: result.reason }, "S3-Dispatch failed");
          throw {
            status_code: 400,
            body: JSON.stringify({
              code: "PROCESS_FAILED",
              error: result.reason ?? "S3-Dispatch fehlgeschlagen",
            }),
          };
        }
        // Return the s3Key + signed URL so the client can render the asset
        return {
          status_code: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s3Key: result.s3Key, signedUrl: result.signedUrl }),
        };
      }

      return {};
    },

    async onResponseError(_req, err) {
      const status = "status_code" in err ? err.status_code : 500;
      // Only log 5xx — 4xx are expected (client errors)
      if (status >= 500) {
        tusLogger.error({ err }, "tus response error");
      }
      return undefined;
    },
  });

  tusLogger.info({ uploadDir: TUS_UPLOAD_DIR, maxSize: TUS_MAX_SIZE_BYTES }, "tus server initialisiert");

  return cachedServer;
}

/**
 * Dispatcher for generic S3/MinIO uploads from the tus server.
 *
 * Called from `onUploadFinish` when `metadata.uploadType === "s3"`. Streams
 * the completed tus file from the local staging into MinIO/S3 and returns
 * the s3Key + a short-lived signed URL to the client (so it can display the
 * uploaded asset immediately).
 *
 * Streaming instead of buffering: tus files can be up to 500 MB. Loading a
 * 500 MB Buffer into RAM per upload risks OOM under concurrency. We stream
 * with a known ContentLength (tus already knows the total size), which lets
 * the S3 SDK send a single PUT without multipart-machinery.
 *
 * We DO read the first ~4 KiB as a Buffer to run magic-number validation
 * — that fits comfortably in memory even under load.
 */

import * as fs from "fs";
import * as fsp from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "@/lib/logger";
import { s3Client, S3_BUCKET, getSignedUrl, ensureBucket } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import {
  checkStorageLimit,
  incrementStorageUsage,
} from "@/lib/storage-tracking";
import { UPLOAD_LIMITS } from "@/lib/config/upload-limits";

const s3Logger = logger.child({ module: "tus-s3-dispatcher" });

/** How many leading bytes we read as Buffer for magic-number validation. */
const MAGIC_HEAD_BYTES = 4096;

export interface S3DispatchInput {
  uploadId: string;
  tusFilePath: string;
  fileSize: number;
  metadata: Record<string, string | null>;
  tenantId: string;
}

export interface S3DispatchResult {
  ok: boolean;
  reason?: string;
  s3Key?: string;
  signedUrl?: string;
}

/**
 * The valid `category` values match the ones in /api/upload/route.ts —
 * kept here as the source of truth for the tus path.
 */
const CATEGORY_MIME_ALLOWLIST: Record<string, string[]> = {
  logo: ["image/png", "image/jpeg", "image/svg+xml", "image/webp"],
  document: [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    // Office (only if magic-number check permits)
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
  ],
  letterhead: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
  avatar: ["image/png", "image/jpeg", "image/webp"],
  "marketing-video": ["video/mp4", "video/webm"],
};

const CATEGORY_MAX_BYTES: Record<string, number> = {
  logo: UPLOAD_LIMITS.logo,
  document: UPLOAD_LIMITS.document,
  letterhead: UPLOAD_LIMITS.letterhead,
  avatar: UPLOAD_LIMITS.avatar,
  "marketing-video": UPLOAD_LIMITS.marketingVideo,
};

export function validateS3Metadata(
  metadata: Record<string, string | null>,
  fileSize: number
): { ok: true; category: string; filetype: string } | { ok: false; reason: string } {
  const { filename, category, filetype } = metadata;

  if (!filename) return { ok: false, reason: "filename fehlt in metadata" };
  if (!category) return { ok: false, reason: "category fehlt in metadata" };
  if (!filetype) return { ok: false, reason: "filetype fehlt in metadata" };

  const allowedMimes = CATEGORY_MIME_ALLOWLIST[category];
  if (!allowedMimes) {
    return { ok: false, reason: `Unbekannte category: ${category}` };
  }
  if (!allowedMimes.includes(filetype)) {
    return {
      ok: false,
      reason: `MIME-Typ ${filetype} nicht erlaubt für category ${category}`,
    };
  }

  const maxSize = CATEGORY_MAX_BYTES[category];
  if (typeof maxSize === "number" && fileSize > maxSize) {
    return {
      ok: false,
      reason: `Datei zu groß: ${fileSize} > ${maxSize} bytes für ${category}`,
    };
  }

  return { ok: true, category, filetype };
}

async function readHead(filePath: string, bytes: number): Promise<Buffer> {
  const fd = await fsp.open(filePath, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fd.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
}

function buildS3Key(tenantId: string, category: string, filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${tenantId}/${category}/${uuidv4()}-${sanitized}`;
}

export async function dispatchS3Upload(
  input: S3DispatchInput
): Promise<S3DispatchResult> {
  const { uploadId, tusFilePath, fileSize, metadata, tenantId } = input;

  const validation = validateS3Metadata(metadata, fileSize);
  if (!validation.ok) {
    s3Logger.warn({ uploadId, reason: validation.reason }, "S3-Dispatch abgelehnt");
    return { ok: false, reason: validation.reason };
  }
  const { category, filetype } = validation;
  const filename = metadata.filename!;

  // Storage-limit re-check (was also validated in onUploadCreate via
  // Upload-Length, but a lot of time can pass between create and finish;
  // another concurrent upload might have exhausted the quota).
  const limit = await checkStorageLimit(tenantId, fileSize);
  if (!limit.allowed) {
    return {
      ok: false,
      reason: `Speicherlimit erreicht (${limit.info.usedFormatted} / ${limit.info.limitFormatted})`,
    };
  }

  // Magic-number check on the first bytes (fits in memory even under load)
  const head = await readHead(tusFilePath, MAGIC_HEAD_BYTES);
  const contentCheck = validateFileContent(head, filetype);
  if (!contentCheck.valid) {
    return {
      ok: false,
      reason: contentCheck.reason ?? "Dateiinhalt-Validierung fehlgeschlagen",
    };
  }

  try {
    await ensureBucket();
  } catch (err) {
    s3Logger.error({ err }, "ensureBucket failed");
    return { ok: false, reason: "Storage-Service nicht verfügbar" };
  }

  const s3Key = buildS3Key(tenantId, category, filename);

  // Stream the file from disk to S3 with a known ContentLength so the SDK
  // sends a single PUT (no multipart machinery needed for our size range).
  const stream = fs.createReadStream(tusFilePath);
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: stream,
        ContentType: filetype,
        ContentLength: fileSize,
        Metadata: {
          "original-filename": filename,
          "tenant-id": tenantId,
          "category": category,
          "uploaded-at": new Date().toISOString(),
          "tus-upload-id": uploadId,
        },
      })
    );
  } catch (err) {
    s3Logger.error({ err, uploadId, s3Key }, "S3 PUT failed");
    return {
      ok: false,
      reason: `Upload fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Track storage usage (silent-fail, does not block)
  await incrementStorageUsage(tenantId, fileSize);

  // Remove the tus staging file — data now lives in MinIO
  await fsp.unlink(tusFilePath).catch(() => {
    /* best effort */
  });
  await fsp.unlink(tusFilePath + ".json").catch(() => {
    /* sidecar */
  });

  const signedUrl = await getSignedUrl(s3Key).catch(() => undefined);

  s3Logger.info(
    { uploadId, tenantId, category, s3Key, fileSize },
    "S3-Dispatch OK"
  );
  return { ok: true, s3Key, signedUrl };
}

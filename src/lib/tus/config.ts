/**
 * Central configuration for the tus (resumable-upload) infrastructure.
 *
 * All paths are env-overridable so Ops can point the temp storage at a
 * mounted volume in production (Docker) without redeploying.
 */

import * as path from "path";
import * as os from "os";

const isWindows = process.platform === "win32";
const defaultTmpBase = isWindows ? "c:/tmp" : os.tmpdir();

/**
 * Directory where tus stores chunk-files during an in-progress upload.
 * When an upload finishes it is MOVED out of here into a per-dispatch
 * staging area (SCADA / documents / …).
 */
export const TUS_UPLOAD_DIR =
  process.env.TUS_UPLOAD_DIR || path.join(defaultTmpBase, "wpm-tus-uploads");

/**
 * Base directory where completed SCADA uploads are staged before the
 * import service picks them up. Layout:
 *   {STAGING}/{tenantId}/{sessionId}/{FILETYPE}/{originalName}
 */
export const TUS_SCADA_STAGING_DIR =
  process.env.TUS_SCADA_STAGING_DIR ||
  path.join(defaultTmpBase, "wpm-scada-tus-staging");

/** Public URL prefix — must match the route folder `/api/tus/[[...tus]]`. */
export const TUS_ROUTE_PATH = "/api/tus";

/** Absolute maximum size for a single tus upload (single file). */
export const TUS_MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

/** Upload expiration — abandoned uploads older than this get GC'd. */
export const TUS_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24h

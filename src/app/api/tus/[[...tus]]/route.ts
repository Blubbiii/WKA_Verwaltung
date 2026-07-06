/**
 * tus protocol endpoint — proxies every method (POST/HEAD/PATCH/DELETE/OPTIONS/GET)
 * of the tus-resumable-upload spec to the shared @tus/server instance.
 *
 * The optional catch-all `[[...tus]]` matches both `/api/tus` (POST to create)
 * and `/api/tus/{uploadId}` (HEAD/PATCH/DELETE against a specific upload).
 *
 * Authentication and per-upload validation happen inside the server's
 * `onUploadCreate` hook — see `src/lib/tus/server.ts`.
 */

import { getTusServer } from "@/lib/tus/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// tus PATCH bodies can be large (chunk = 5 MB by default). Next.js has no
// per-route size limit for the fetch/Web-Request path in App Router, but we
// disable buffering to make streaming to disk cheap.
export const maxDuration = 300;

async function handler(req: Request): Promise<Response> {
  const server = await getTusServer();
  return server.handleWeb(req);
}

export const GET = handler;
export const POST = handler;
export const HEAD = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;

/**
 * Paperless-ngx Integration
 *
 * Re-exports and factory function for the Paperless client.
 */

export { PaperlessClient, PaperlessApiError } from "./client";
export type {
  PaperlessDocument,
  PaperlessDocumentList,
  PaperlessTag,
  PaperlessDocumentType,
  PaperlessCorrespondent,
  PaperlessConnectionResult,
  PaperlessUploadOptions,
} from "./types";

import { getPaperlessConfig } from "@/lib/config";
import { PaperlessClient } from "./client";
import { logger } from "@/lib/logger";

/**
 * Get a configured PaperlessClient for a tenant.
 * Returns null if Paperless is not configured or disabled.
 */
export async function getPaperlessClient(
  tenantId?: string | null
): Promise<PaperlessClient | null> {
  const config = await getPaperlessConfig(tenantId);
  if (!config?.url || !config?.token) return null;
  return new PaperlessClient(config.url, config.token);
}

/**
 * Enqueue a document for Paperless archival (fire-and-forget).
 * Checks if Paperless is enabled and auto-archive is on before enqueuing.
 */
export async function enqueuePaperlessSync(
  documentId: string,
  tenantId: string
): Promise<void> {
  try {
    const config = await getPaperlessConfig(tenantId);
    if (!config) return; // Paperless not configured/enabled
    if (!config.autoArchive) return; // Auto-archive disabled

    const { enqueuePaperlessJob } = await import(
      "@/lib/queue/queues/paperless.queue"
    );
    await enqueuePaperlessJob({ documentId, tenantId, action: "upload" });
  } catch (error) {
    logger.warn({ err: error, documentId }, "[Paperless] Failed to enqueue sync");
  }
}

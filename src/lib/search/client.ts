/**
 * Meilisearch Client — singleton, lazy-initialized
 */
import { MeiliSearch } from "meilisearch";
import { logger } from "@/lib/logger";

let _client: MeiliSearch | null = null;

export function getMeilisearchClient(): MeiliSearch | null {
  const url = process.env.MEILISEARCH_URL;
  const key = process.env.MEILISEARCH_KEY;
  if (!url) return null;
  if (!_client) {
    _client = new MeiliSearch({ host: url, apiKey: key });
    logger.info({ url }, "[Meilisearch] Client initialized");
  }
  return _client;
}

export const INDICES = {
  DOCUMENTS: "documents",
  INVOICES: "invoices",
  PARKS: "parks",
  TURBINES: "turbines",
  AUDIT_LOGS: "audit_logs",
} as const;

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

/**
 * Ist die Volltextsuche eingeschaltet?
 *
 * TF-8 (Audit 2026-07): Der Admin-Schalter schrieb `meilisearch.enabled`, und
 * kein einziges `getConfigBoolean("meilisearch.enabled")` existierte im ganzen
 * Code. Der Schalter schaltete also nichts, und `/api/features` fuehrte das
 * Flag nicht — eine sichtbare, aber wirkungslose Einstellung.
 *
 * Zwei Bedingungen muessen erfuellt sein: der Dienst ist erreichbar
 * (MEILISEARCH_URL gesetzt) UND der Mandant hat die Suche aktiviert.
 */
export async function isSearchEnabled(tenantId?: string | null): Promise<boolean> {
  if (!process.env.MEILISEARCH_URL) return false;
  const { getConfigBoolean } = await import("@/lib/config");
  return getConfigBoolean("meilisearch.enabled", tenantId, false);
}

export const INDICES = {
  DOCUMENTS: "documents",
  INVOICES: "invoices",
  PARKS: "parks",
  TURBINES: "turbines",
  AUDIT_LOGS: "audit_logs",
} as const;

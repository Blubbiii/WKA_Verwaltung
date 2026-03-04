/**
 * GET /api/search?q=query&entity=documents,invoices,parks
 * Global search across all Meilisearch indices for the current tenant.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { getMeilisearchClient, INDICES } from "@/lib/search/client";
import { apiLogger as logger } from "@/lib/logger";
import type { SearchEntity } from "@/lib/search/types";

const ALL_ENTITIES: SearchEntity[] = ["documents", "invoices", "parks", "turbines", "audit_logs"];

const ENTITY_INDEX_MAP: Record<SearchEntity, string> = {
  documents: INDICES.DOCUMENTS,
  invoices: INDICES.INVOICES,
  parks: INDICES.PARKS,
  turbines: INDICES.TURBINES,
  audit_logs: INDICES.AUDIT_LOGS,
};

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("documents:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) return NextResponse.json({ error: "Kein Mandant" }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const entityParam = searchParams.get("entity");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [], query: q });
    }

    const client = getMeilisearchClient();
    if (!client) {
      return NextResponse.json({ error: "Suche nicht konfiguriert" }, { status: 503 });
    }

    const entities: SearchEntity[] = entityParam
      ? (entityParam.split(",").filter((e) => ALL_ENTITIES.includes(e as SearchEntity)) as SearchEntity[])
      : ALL_ENTITIES;

    const queries = entities.map((entity) => ({
      indexUid: ENTITY_INDEX_MAP[entity],
      q,
      limit,
      filter: [`tenantId = ${JSON.stringify(check.tenantId)}`],
    }));

    // Multi-index search
    const { results } = await client.multiSearch({ queries });

    const merged = results.flatMap((result: { hits?: Record<string, unknown>[] }, i: number) => {
      const entity = entities[i]!;
      return (result.hits ?? []).map((hit: Record<string, unknown>) => ({
        entityType: entity,
        ...hit,
      }));
    });

    return NextResponse.json({ results: merged, query: q, total: merged.length });
  } catch (error) {
    logger.error({ err: error }, "[Search API] Error");
    return NextResponse.json({ error: "Suchfehler" }, { status: 500 });
  }
}

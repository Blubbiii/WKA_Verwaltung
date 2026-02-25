/**
 * Paperless Documents API - List & Search
 *
 * GET /api/integrations/paperless/documents
 * Proxies document listing/search requests to Paperless-ngx.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getConfigBoolean } from "@/lib/config";
import { getPaperlessClient } from "@/lib/paperless";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error;

    // Check if Paperless is enabled
    const enabled = await getConfigBoolean("paperless.enabled", check.tenantId, false);
    if (!enabled) {
      return NextResponse.json({ error: "Paperless integration not enabled" }, { status: 404 });
    }

    const client = await getPaperlessClient(check.tenantId);
    if (!client) {
      return NextResponse.json({ error: "Paperless not configured" }, { status: 503 });
    }

    const { searchParams } = request.nextUrl;

    const result = await client.listDocuments({
      query: searchParams.get("query") || undefined,
      page: searchParams.get("page") ? parseInt(searchParams.get("page")!) : undefined,
      pageSize: searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 25,
      ordering: searchParams.get("ordering") || "-created",
      documentType: searchParams.get("documentType") ? parseInt(searchParams.get("documentType")!) : undefined,
      correspondent: searchParams.get("correspondent") ? parseInt(searchParams.get("correspondent")!) : undefined,
      tags: searchParams.get("tags") ? searchParams.get("tags")!.split(",").map(Number) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

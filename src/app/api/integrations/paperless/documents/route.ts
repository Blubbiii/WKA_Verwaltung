/**
 * Paperless Documents API - List & Search
 *
 * GET /api/integrations/paperless/documents
 * Proxies document listing/search requests to Paperless-ngx.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
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
      return apiError("NOT_FOUND", 404, { message: "Paperless integration not enabled" });
    }

    const client = await getPaperlessClient(check.tenantId);
    if (!client) {
      return apiError("INTERNAL_ERROR", 503, { message: "Paperless not configured" });
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
    return apiError("INTERNAL_ERROR", 500, { message });
  }
}

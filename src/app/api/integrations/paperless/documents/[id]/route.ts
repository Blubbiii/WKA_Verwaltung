/**
 * Paperless Document Detail API
 *
 * GET /api/integrations/paperless/documents/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getConfigBoolean } from "@/lib/config";
import { getPaperlessClient } from "@/lib/paperless";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error;

    const enabled = await getConfigBoolean("paperless.enabled", check.tenantId, false);
    if (!enabled) {
      return apiError("NOT_FOUND", 404, { message: "Paperless integration not enabled" });
    }

    const client = await getPaperlessClient(check.tenantId);
    if (!client) {
      return apiError("INTERNAL_ERROR", 503, { message: "Paperless not configured" });
    }

    const { id } = await params;
    const doc = await client.getDocument(parseInt(id));

    return NextResponse.json(doc);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError("INTERNAL_ERROR", 500, { message });
  }
}

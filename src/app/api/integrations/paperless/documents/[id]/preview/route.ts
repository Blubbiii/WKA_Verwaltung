/**
 * Paperless Document Preview Proxy
 *
 * GET /api/integrations/paperless/documents/[id]/preview
 * Streams the document preview/thumbnail from Paperless-ngx.
 */

import { NextRequest, NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Paperless integration not enabled" }, { status: 404 });
    }

    const client = await getPaperlessClient(check.tenantId);
    if (!client) {
      return NextResponse.json({ error: "Paperless not configured" }, { status: 503 });
    }

    const { id } = await params;
    const { stream, contentType } = await client.getPreview(parseInt(id));

    return new NextResponse(stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

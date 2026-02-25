/**
 * Paperless Document Download Proxy
 *
 * GET /api/integrations/paperless/documents/[id]/download
 * Streams the original document from Paperless-ngx.
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
    const { stream, contentType, contentLength } = await client.downloadDocument(parseInt(id));

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="paperless-${id}"`,
    };
    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    return new NextResponse(stream, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

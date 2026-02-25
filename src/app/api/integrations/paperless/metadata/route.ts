/**
 * Paperless Metadata API
 *
 * GET /api/integrations/paperless/metadata
 * Returns tags, document types, and correspondents from Paperless-ngx.
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getConfigBoolean } from "@/lib/config";
import { getPaperlessClient } from "@/lib/paperless";

export async function GET() {
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

    const [tags, documentTypes, correspondents] = await Promise.all([
      client.getTags(),
      client.getDocumentTypes(),
      client.getCorrespondents(),
    ]);

    return NextResponse.json({ tags, documentTypes, correspondents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

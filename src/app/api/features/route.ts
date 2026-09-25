/**
 * Public Feature Flags API (for any authenticated user)
 *
 * GET - Returns which features are enabled for the current user's tenant
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/withPermission";
import { ladeFeatureFlags } from "@/lib/features/tenant-flags";

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    return NextResponse.json(await ladeFeatureFlags(check.tenantId));
  } catch {
    return NextResponse.json({
      "management-billing": false,
      "paperless": false,
      "communication": false,
      "crm": false,
      "gis": false,
      "inbox": false,
      "wirtschaftsplan": false,
      "document-routing": false,
      "scada-uploader-v2": false,
      "meilisearch": false,
      "uploader-v2-generic": false,
    });
  }
}

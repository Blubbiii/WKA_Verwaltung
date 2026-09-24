/**
 * Public Feature Flags API (for any authenticated user)
 *
 * GET - Returns which features are enabled for the current user's tenant
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const tid = check.tenantId;

    const [
      managementBillingEnabled,
      paperlessEnabled,
      communicationEnabled,
      crmEnabled,
      gisEnabled,
      inboxEnabled,
      wirtschaftsplanEnabled,
      documentRoutingEnabled,
      marketDataEnabled,
      // The PPA page and sidebar asked for this flag, the route never
      // delivered it — the module stayed disabled for every tenant.
      ppaManagementEnabled,
      scadaUploaderV2Enabled,
      uploaderV2GenericEnabled,
      // TF-8: Das Flag existierte, wurde aber nirgends gelesen — der
      // Admin-Schalter schaltete nichts und /api/features fuehrte es nicht.
      meilisearchEnabled,
    ] = await Promise.all([
      getConfigBoolean("management-billing.enabled", tid, false),
      getConfigBoolean("paperless.enabled", tid, false),
      getConfigBoolean("communication.enabled", tid, false),
      getConfigBoolean("crm.enabled", tid, false),
      getConfigBoolean("gis.enabled", tid, false),
      getConfigBoolean("inbox.enabled", tid, false),
      getConfigBoolean("wirtschaftsplan.enabled", tid, false),
      getConfigBoolean("document-routing.enabled", tid, false),
      getConfigBoolean("marketData.enabled", tid, false),
      getConfigBoolean("ppa-management.enabled", tid, false),
      getConfigBoolean("scada-uploader-v2.enabled", tid, false),
      getConfigBoolean("uploader-v2-generic.enabled", tid, false),
      getConfigBoolean("meilisearch.enabled", tid, false),
    ]);

    return NextResponse.json({
      "management-billing": managementBillingEnabled,
      "paperless": paperlessEnabled,
      "communication": communicationEnabled,
      "crm": crmEnabled,
      "gis": gisEnabled,
      "inbox": inboxEnabled,
      "wirtschaftsplan": wirtschaftsplanEnabled,
      "document-routing": documentRoutingEnabled,
      "marketData": marketDataEnabled,
      "ppa-management": ppaManagementEnabled,
      "scada-uploader-v2": scadaUploaderV2Enabled,
      "uploader-v2-generic": uploaderV2GenericEnabled,
      "meilisearch": meilisearchEnabled,
    });
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

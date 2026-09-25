/**
 * Feature flags of a tenant as delivered to the UI. Shared by /api/features
 * and the dashboard layout, which seeds them so the sidebar does not jump.
 */
import { getConfigBoolean } from "@/lib/config";

export async function ladeFeatureFlags(tid: string | null | undefined): Promise<Record<string, boolean>> {
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

  return {
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
  };
}

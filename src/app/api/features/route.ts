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

    const managementBillingEnabled = await getConfigBoolean(
      "management-billing.enabled",
      check.tenantId,
      false
    );

    const paperlessEnabled = await getConfigBoolean(
      "paperless.enabled",
      check.tenantId,
      false
    );

    const communicationEnabled = await getConfigBoolean(
      "communication.enabled",
      check.tenantId,
      false
    );

    const crmEnabled = await getConfigBoolean(
      "crm.enabled",
      check.tenantId,
      false
    );

    const inboxEnabled = await getConfigBoolean(
      "inbox.enabled",
      check.tenantId,
      false
    );

    return NextResponse.json({
      "management-billing": managementBillingEnabled,
      "paperless": paperlessEnabled,
      "communication": communicationEnabled,
      "crm": crmEnabled,
      "inbox": inboxEnabled,
    });
  } catch {
    return NextResponse.json({
      "management-billing": false,
      "paperless": false,
      "communication": false,
      "crm": false,
      "inbox": false,
    });
  }
}

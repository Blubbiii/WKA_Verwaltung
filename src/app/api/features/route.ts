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

    return NextResponse.json({
      "management-billing": managementBillingEnabled,
    });
  } catch {
    return NextResponse.json({
      "management-billing": false,
    });
  }
}

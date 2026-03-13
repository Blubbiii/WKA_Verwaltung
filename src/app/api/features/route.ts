/**
 * Public Feature Flags API (for any authenticated user)
 *
 * GET - Returns which features are enabled for the current user's tenant
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";

// Accounting sub-module keys
const ACCOUNTING_SUB_KEYS = [
  "accounting.reports",
  "accounting.bank",
  "accounting.dunning",
  "accounting.sepa",
  "accounting.ustva",
  "accounting.assets",
  "accounting.cashbook",
  "accounting.datev",
  "accounting.yearend",
  "accounting.costcenter",
  "accounting.budget",
  "accounting.quotes",
  "accounting.liquidity",
  "accounting.ocr",
  "accounting.multibanking",
] as const;

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
      inboxEnabled,
      wirtschaftsplanEnabled,
      accountingEnabled,
      documentRoutingEnabled,
    ] = await Promise.all([
      getConfigBoolean("management-billing.enabled", tid, false),
      getConfigBoolean("paperless.enabled", tid, false),
      getConfigBoolean("communication.enabled", tid, false),
      getConfigBoolean("crm.enabled", tid, false),
      getConfigBoolean("inbox.enabled", tid, false),
      getConfigBoolean("wirtschaftsplan.enabled", tid, false),
      getConfigBoolean("accounting.enabled", tid, false),
      getConfigBoolean("document-routing.enabled", tid, false),
    ]);

    // Load accounting sub-flags only if master is enabled
    const accountingSub: Record<string, boolean> = {};
    if (accountingEnabled) {
      const subResults = await Promise.all(
        ACCOUNTING_SUB_KEYS.map((key) =>
          getConfigBoolean(`${key}.enabled`, tid, true)
        )
      );
      ACCOUNTING_SUB_KEYS.forEach((key, i) => {
        accountingSub[key] = subResults[i];
      });
    } else {
      // Master off → all sub-flags false
      ACCOUNTING_SUB_KEYS.forEach((key) => {
        accountingSub[key] = false;
      });
    }

    return NextResponse.json({
      "management-billing": managementBillingEnabled,
      "paperless": paperlessEnabled,
      "communication": communicationEnabled,
      "crm": crmEnabled,
      "inbox": inboxEnabled,
      "wirtschaftsplan": wirtschaftsplanEnabled,
      "accounting": accountingEnabled,
      "document-routing": documentRoutingEnabled,
      ...accountingSub,
    });
  } catch {
    return NextResponse.json({
      "management-billing": false,
      "paperless": false,
      "communication": false,
      "crm": false,
      "inbox": false,
      "wirtschaftsplan": false,
      "accounting": false,
      "document-routing": false,
      "accounting.reports": false,
      "accounting.bank": false,
      "accounting.dunning": false,
      "accounting.sepa": false,
      "accounting.ustva": false,
      "accounting.assets": false,
      "accounting.cashbook": false,
      "accounting.datev": false,
      "accounting.yearend": false,
      "accounting.costcenter": false,
      "accounting.budget": false,
      "accounting.quotes": false,
      "accounting.liquidity": false,
      "accounting.ocr": false,
      "accounting.multibanking": false,
    });
  }
}

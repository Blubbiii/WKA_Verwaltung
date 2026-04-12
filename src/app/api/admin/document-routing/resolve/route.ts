/**
 * API Route: /api/admin/document-routing/resolve
 * GET: Resolve the target path for a given fundId + invoiceType
 * Used by n8n to determine where to upload documents
 *
 * Query params: fundId, invoiceType (INVOICE|CREDIT_NOTE), targetType (default: onedrive)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const invoiceType = searchParams.get("invoiceType");
    const targetType = searchParams.get("targetType") || "onedrive";

    if (!invoiceType || !["INVOICE", "CREDIT_NOTE"].includes(invoiceType)) {
      return apiError("BAD_REQUEST", undefined, { message: "invoiceType muss INVOICE oder CREDIT_NOTE sein" });
    }

    // Try specific fund match first, then fallback to null (catch-all)
    const rule = await prisma.documentRoutingRule.findFirst({
      where: {
        tenantId: check.tenantId!,
        invoiceType: invoiceType as "INVOICE" | "CREDIT_NOTE",
        targetType,
        isActive: true,
        fundId: fundId || null,
      },
    });

    // Fallback: no fund-specific rule → try catch-all (fundId = null)
    const fallback =
      !rule && fundId
        ? await prisma.documentRoutingRule.findFirst({
            where: {
              tenantId: check.tenantId!,
              invoiceType: invoiceType as "INVOICE" | "CREDIT_NOTE",
              targetType,
              isActive: true,
              fundId: null,
            },
          })
        : null;

    const match = rule || fallback;

    if (!match) {
      return apiError("NOT_FOUND", 404, {
        message: "Keine Routing-Regel gefunden",
        details: { resolved: false },
      });
    }

    return NextResponse.json({
      resolved: true,
      targetPath: match.targetPath,
      targetType: match.targetType,
      ruleId: match.id,
    });
  } catch (error) {
    logger.error({ err: error }, "Error resolving document routing");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Auflösen der Routing-Regel" });
  }
}

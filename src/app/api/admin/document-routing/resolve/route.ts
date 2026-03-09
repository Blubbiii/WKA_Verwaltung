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

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const invoiceType = searchParams.get("invoiceType");
    const targetType = searchParams.get("targetType") || "onedrive";

    if (!invoiceType || !["INVOICE", "CREDIT_NOTE"].includes(invoiceType)) {
      return NextResponse.json(
        { error: "invoiceType muss INVOICE oder CREDIT_NOTE sein" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Keine Routing-Regel gefunden", resolved: false },
        { status: 404 }
      );
    }

    return NextResponse.json({
      resolved: true,
      targetPath: match.targetPath,
      targetType: match.targetType,
      ruleId: match.id,
    });
  } catch (error) {
    logger.error({ err: error }, "Error resolving document routing");
    return NextResponse.json(
      { error: "Fehler beim Auflösen der Routing-Regel" },
      { status: 500 }
    );
  }
}

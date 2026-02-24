/**
 * API Route: /api/admin/billing-rules/[id]/execute
 * POST: Regel manuell ausfuehren
 * Query: ?dryRun=true für Vorschau
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { executeRule, previewRule } from "@/lib/billing";
import { apiLogger as logger } from "@/lib/logger";

// POST /api/admin/billing-rules/[id]/execute
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "true";

    // Pruefe ob Regel existiert und zum Tenant gehoert
    const rule = await prisma.billingRule.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        ruleType: true,
      },
    });

    if (!rule) {
      return NextResponse.json(
        { error: "Abrechnungsregel nicht gefunden" },
        { status: 404 }
      );
    }

    // Optional: Body mit Override-Parametern
    let overrideParameters: Record<string, unknown> | undefined;
    try {
      const body = await request.json();
      if (body && typeof body === "object" && Object.keys(body).length > 0) {
        overrideParameters = body;
      }
    } catch {
      // Kein Body oder ungültiges JSON - ignorieren
    }

    // Fuehre Regel aus
    const result = await executeRule(id, {
      dryRun,
      forceRun: true, // Manuelle Ausführung ignoriert nextRunAt
      overrideParameters,
    });

    // Response formatieren
    const response = {
      success: result.status === "success",
      status: result.status,
      dryRun,
      rule: {
        id: rule.id,
        name: rule.name,
        ruleType: rule.ruleType,
      },
      summary: {
        invoicesCreated: result.invoicesCreated,
        totalAmount: result.totalAmount,
        totalProcessed: result.details.summary.totalProcessed,
        successful: result.details.summary.successful,
        failed: result.details.summary.failed,
        skipped: result.details.summary.skipped,
      },
      errorMessage: result.errorMessage,
      executionId: result.executionId,
      invoices: result.details.invoices.map((inv) => ({
        success: inv.success,
        invoiceId: inv.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        recipientName: inv.recipientName,
        amount: inv.amount,
        error: inv.error,
      })),
      warnings: result.details.warnings,
      metadata: result.details.metadata,
    };

    // Status Code basierend auf Ergebnis
    const statusCode = result.status === "failed" ? 422 : 200;

    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    logger.error({ err: error }, "Error executing billing rule");

    const errorMessage =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error: errorMessage,
        summary: {
          invoicesCreated: 0,
          totalAmount: 0,
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
        },
        invoices: [],
      },
      { status: 500 }
    );
  }
}

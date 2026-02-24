import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import {
  generateAdvanceInvoices,
  generateSettlementInvoices,
  generateAllocationInvoices,
} from "@/lib/lease-revenue/invoice-generator";
import { executeCostAllocation } from "@/lib/lease-revenue/allocator";

// =============================================================================
// POST /api/leases/settlement/[id]/invoices - Generate credit notes (Gutschriften)
//
// For ADVANCE settlements: generates advance invoices (Vorschuss-Gutschriften)
// For FINAL settlements: generates settlement invoices (Endabrechnungs-Gutschriften)
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Parse optional body parameters (e.g. initialStatus from wizard)
    let initialStatus: "DRAFT" | "SENT" = "DRAFT";
    try {
      const body = await request.json();
      if (body.initialStatus === "SENT") {
        initialStatus = "SENT";
      }
    } catch {
      // No body — default to DRAFT
    }

    // Load settlement to determine period type and verify ownership + status
    const settlement = await prisma.leaseRevenueSettlement.findFirst({
      where: {
        id,
        ...(check.tenantId ? { tenantId: check.tenantId } : {}),
      },
      include: {
        items: true,
        park: { select: { id: true, name: true, leaseSettlementMode: true } },
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: "Nutzungsentgelt-Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (settlement.items.length === 0) {
      return NextResponse.json(
        {
          error: "Keine Positionen vorhanden",
          details: "Bitte zuerst die Berechnung durchfuehren.",
        },
        { status: 400 }
      );
    }

    const isAdvance = settlement.periodType === "ADVANCE";

    if (isAdvance) {
      // ADVANCE: generate advance invoices
      if (settlement.status !== "CALCULATED") {
        return NextResponse.json(
          {
            error: "Vorschussrechnungen können nur für berechnete Abrechnungen erstellt werden",
            details: `Aktueller Status: ${settlement.status}. Bitte zuerst die Berechnung durchfuehren.`,
          },
          { status: 400 }
        );
      }

      const result = await generateAdvanceInvoices(
        check.tenantId!,
        id,
        check.userId,
        { initialStatus }
      );

      // Load created invoices for wizard display
      const invoices = result.invoiceIds.length > 0
        ? await prisma.invoice.findMany({
            where: { id: { in: result.invoiceIds } },
            select: { id: true, invoiceNumber: true, invoiceType: true, recipientName: true, grossAmount: true, status: true },
          })
        : [];

      // Auto-trigger cost allocation for all parks
      const allocationInvoices = await tryGenerateAllocationInvoices(
        check.tenantId!,
        id,
        settlement.year,
        settlement.periodType,
        settlement.advanceInterval,
        settlement.month,
        check.userId ?? undefined
      );

      return NextResponse.json(serializePrisma({ ...result, invoices, allocationInvoices }));
    } else {
      // FINAL: generate settlement invoices (remainder after advances)
      if (
        settlement.status !== "CALCULATED" &&
        settlement.status !== "ADVANCE_CREATED"
      ) {
        return NextResponse.json(
          {
            error: "Endabrechnungs-Gutschriften können nur für berechnete Abrechnungen erstellt werden",
            details: `Aktueller Status: ${settlement.status}. Bitte zuerst die Berechnung durchfuehren.`,
          },
          { status: 400 }
        );
      }

      const result = await generateSettlementInvoices(
        check.tenantId!,
        id,
        check.userId,
        { initialStatus }
      );

      // Load created invoices for wizard display
      const invoices = result.invoiceIds.length > 0
        ? await prisma.invoice.findMany({
            where: { id: { in: result.invoiceIds } },
            select: { id: true, invoiceNumber: true, invoiceType: true, recipientName: true, grossAmount: true, status: true },
          })
        : [];

      // Auto-trigger cost allocation for all parks
      const allocationInvoices = await tryGenerateAllocationInvoices(
        check.tenantId!,
        id,
        settlement.year,
        settlement.periodType,
        settlement.advanceInterval,
        settlement.month,
        check.userId ?? undefined
      );

      return NextResponse.json(serializePrisma({ ...result, invoices, allocationInvoices }));
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    if (message.includes("nicht gefunden") || message.includes("Status")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    logger.error(
      { err: error },
      "Error generating invoices for lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Gutschriften" },
      { status: 500 }
    );
  }
}

// =============================================================================
// Helper: Auto-generate allocation invoices (Betreiber-Rechnungen)
// =============================================================================

/**
 * When the park uses NETWORK_COMPANY mode, automatically create cost allocation
 * and generate invoices to operator companies after credit notes are created.
 * Returns the allocation invoices or an empty array if not applicable.
 */
async function tryGenerateAllocationInvoices(
  tenantId: string,
  settlementId: string,
  year: number,
  periodType: string,
  advanceInterval: string | null,
  month: number | null,
  userId?: string
) {

  try {
    // Build period label for the allocation
    let periodLabel = `Nutzungsentgelt ${year}`;
    if (periodType === "ADVANCE") {
      if (advanceInterval === "QUARTERLY" && month != null) {
        const quarter = Math.ceil(month / 3);
        periodLabel = `Vorschuss Q${quarter} ${year}`;
      } else if (advanceInterval === "MONTHLY" && month != null) {
        periodLabel = `Vorschuss ${String(month).padStart(2, "0")}/${year}`;
      } else {
        periodLabel = `Vorschuss ${year}`;
      }
    }

    // Step 1: Create cost allocation (distributes costs to operators)
    const { allocation } = await executeCostAllocation(
      tenantId,
      settlementId,
      periodLabel
    );

    // Step 2: Generate invoices from allocation (VAT + exempt per operator)
    const allocResult = await generateAllocationInvoices(
      tenantId,
      allocation.id,
      userId
    );

    // Step 3: Load created invoices for wizard display
    if (allocResult.invoiceIds.length > 0) {
      const loaded = await prisma.invoice.findMany({
        where: { id: { in: allocResult.invoiceIds } },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceType: true,
          recipientName: true,
          grossAmount: true,
          status: true,
        },
      });
      return loaded;
    }
  } catch (error) {
    // Cost allocation is non-critical - log but don't fail the request
    logger.warn(
      { err: error },
      "Cost allocation failed (non-critical) - credit notes were created successfully"
    );
  }

  return [];
}

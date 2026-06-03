/**
 * Freigabe einer Eingangsrechnung (Phase 13, D6+D8).
 *
 * POST /api/inbox/[id]/approve
 *
 * Status-Wechsel REVIEW/INBOX → APPROVED. Setzt approvedById + approvedAt.
 *
 * Schutzschichten:
 *  - D6 §14 UStG Validator: prüft Pflichtangaben für Vorsteuerabzug.
 *    Fehlende Angaben → 422 mit konkreter Liste der Mängel.
 *  - D8 4-Augen-Prinzip: approvedById MUSS ≠ createdById sein
 *    (oberhalb der TenantSettings.fourEyesThresholdEur Schwelle).
 *    Unter der Schwelle reicht 1-Augen (z.B. Kleinbetragsrechnungen).
 *    fourEyesThresholdEur = null → IMMER 4-Augen.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { getTenantSettings } from "@/lib/tenant-settings";
import { loadUstgConfig } from "@/lib/system-settings";
import {
  assertVorsteuerCapable,
  VorsteuerCapabilityError,
} from "@/lib/accounting/incoming-invoice-validator";
import { findOrCreateApprovalRequest } from "@/lib/approvals/manager";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("inbox:approve");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }
    if (!(await getConfigBoolean("inbox.enabled", check.tenantId, false))) {
      return apiError("FEATURE_DISABLED", 404, { message: "Inbox nicht aktiviert" });
    }
    const { id } = await params;

    const existing = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      include: {
        vendor: {
          select: {
            name: true,
            street: true,
            postalCode: true,
            city: true,
            taxId: true,
            vatId: true,
          },
        },
      },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden" });
    }

    if (!["REVIEW", "INBOX"].includes(existing.status)) {
      return apiError("CONFLICT", 409, {
        message: `Rechnung kann von Status "${existing.status}" nicht genehmigt werden`,
      });
    }

    // D8: 4-Augen-Prinzip.
    const settings = await getTenantSettings(check.tenantId);
    const threshold = settings.fourEyesThresholdEur;
    const gross = Number(existing.grossAmount ?? 0);
    const requireFourEyes = threshold === null || gross > threshold;

    if (requireFourEyes && existing.createdById === check.userId) {
      // Sprint 3 Permissions v2: statt 403 → ApprovalRequest erzeugen,
      // taucht in /approvals-Inbox auf. Bei Decide-APPROVED läuft Executor
      // executeIncomingInvoiceApprove und setzt status=APPROVED.
      const approvalRequest = await findOrCreateApprovalRequest({
        tenantId: check.tenantId!,
        action: "INCOMING_INVOICE_APPROVE",
        entityType: "IncomingInvoice",
        entityId: id,
        amountEur: gross,
        requestedById: check.userId!,
        requestReason: `Eigene Eingangsrechnung freigeben (Brutto ${gross.toFixed(2)} €)`,
      });
      return NextResponse.json(
        {
          status: "PENDING_APPROVAL",
          message:
            threshold === null
              ? "Vier-Augen-Prinzip: ein zweiter berechtigter User muss freigeben."
              : `Vier-Augen-Prinzip: Rechnungen über ${threshold.toFixed(2)} € müssen von einem anderen User freigegeben werden.`,
          approvalRequest: {
            id: approvalRequest.id,
            expiresAt: approvalRequest.expiresAt.toISOString(),
            threshold,
            grossAmount: gross,
          },
        },
        { status: 202 },
      );
    }

    // D6: §14 UStG Pflichtangaben für Vorsteuerabzug.
    const ustgConfig = await loadUstgConfig();
    try {
      assertVorsteuerCapable(
        {
          invoiceNumber: existing.invoiceNumber,
          invoiceDate: existing.invoiceDate,
          vendorId: existing.vendorId,
          vendorNameFallback: existing.vendorNameFallback,
          netAmount: existing.netAmount,
          vatAmount: existing.vatAmount,
          grossAmount: existing.grossAmount,
          vatRate: existing.vatRate,
          supplierTaxId: existing.supplierTaxId,
        },
        existing.vendor,
        ustgConfig,
      );
    } catch (err) {
      if (err instanceof VorsteuerCapabilityError) {
        return apiError("VAT_DEDUCTION_FAILED", 422, {
          message: err.message,
          details: { missing: err.missing },
        });
      }
      throw err;
    }

    const updated = await prisma.incomingInvoice.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: check.userId!,
        approvedAt: new Date(),
      },
    });

    logger.info(
      {
        tenantId: check.tenantId,
        invoiceId: id,
        approvedById: check.userId,
        createdById: existing.createdById,
        gross,
      },
      "Incoming invoice approved",
    );

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error approving inbox invoice");
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler beim Genehmigen" });
  }
}

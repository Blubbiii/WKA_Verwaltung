import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { isSkontoValid } from "@/lib/invoices/skonto";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import { dispatchWebhook } from "@/lib/webhooks";
import { apiError } from "@/lib/api-errors";

const markPaidSchema = z.object({
  paidAt: z.string().optional(), // ISO date string, defaults to now
  applySkonto: z.boolean().optional(), // Whether to apply Skonto discount
});

// POST /api/invoices/[id]/mark-paid - Rechnung als bezahlt markieren
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    let paidAt = new Date();
    let applySkonto = false;
    try {
      const body = await request.json();
      const validated = markPaidSchema.parse(body);
      if (validated.paidAt) {
        paidAt = new Date(validated.paidAt);
      }
      if (validated.applySkonto) {
        applySkonto = true;
      }
    } catch {
      // Body ist optional, verwende Standardwert
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        skontoPercent: true,
        skontoDays: true,
        skontoDeadline: true,
        skontoAmount: true,
        grossAmount: true,
      },
    });

    if (!invoice) {
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    if (invoice.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    if (invoice.status === "CANCELLED") {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Stornierte Rechnungen können nicht als bezahlt markiert werden" });
    }

    if (invoice.status === "PAID") {
      return apiError("BAD_REQUEST", undefined, { message: "Rechnung ist bereits als bezahlt markiert" });
    }

    if (invoice.status === "DRAFT") {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Entwuerfe können nicht als bezahlt markiert werden. Bitte erst versenden." });
    }

    // Handle Skonto: auto-apply if eligible and not explicitly set
    let skontoPaid = false;
    if (applySkonto) {
      // Explicit request to apply Skonto
      if (!invoice.skontoPercent || !invoice.skontoDeadline) {
        return apiError("BAD_REQUEST", undefined, { message: "Kein Skonto für diese Rechnung konfiguriert" });
      }

      if (!isSkontoValid(invoice.skontoDeadline, paidAt)) {
        return apiError("BAD_REQUEST", undefined, { message: "Skonto-Frist ist abgelaufen. Zahlung nach dem Stichtag." });
      }

      skontoPaid = true;
    } else if (
      // Auto-apply: Skonto configured, deadline not passed, payment within window
      invoice.skontoPercent &&
      invoice.skontoDeadline &&
      isSkontoValid(invoice.skontoDeadline, paidAt)
    ) {
      skontoPaid = true;
      logger.info(
        { invoiceId: id, skontoPercent: Number(invoice.skontoPercent) },
        "Skonto auto-applied (payment within deadline)"
      );
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt,
        ...(skontoPaid && { skontoPaid: true }),
      },
      include: {
        items: { orderBy: { position: "asc" } },
      },
    });

    // Invalidate dashboard caches after marking invoice as paid
    invalidate.onInvoiceChange(check.tenantId!, id, 'update').catch((err) => {
      logger.warn({ err }, '[Invoices] Cache invalidation error after mark-paid');
    });

    // Fire-and-forget webhook for invoice payment
    dispatchWebhook(check.tenantId!, "invoice.paid", {
      invoiceId: updated.id,
      paidAt: paidAt.toISOString(),
      skontoPaid,
      amount: Number(invoice.grossAmount),
    }).catch((err) => { logger.warn({ err }, "[Webhook] Dispatch failed"); });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "Error marking invoice as paid");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Markieren als bezahlt" });
  }
}

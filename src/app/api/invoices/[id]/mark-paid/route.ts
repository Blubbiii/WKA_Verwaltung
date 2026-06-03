import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { isSkontoValid } from "@/lib/invoices/skonto";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import { dispatchWebhook } from "@/lib/webhooks";
import { apiError } from "@/lib/api-errors";
import { createUStAdjustment } from "@/lib/accounting/ust-adjustment";
import { getTenantSettings } from "@/lib/tenant-settings";
import { PeriodLockedError } from "@/lib/accounting/period-lock";
import { recordPayment } from "@/lib/accounting/invoice-payment";
import { invalidateReportsCache } from "@/lib/cache/reports";
import { Decimal } from "@prisma/client-runtime-utils";

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

    // M-3-Fix: Body-Parsing-Fehler nicht still schlucken — nur "kein Body"
    // ist OK (Default-Werte), syntaktisch falsches JSON aber als 400 melden.
    let paidAt = new Date();
    let applySkonto = false;
    const contentLength = request.headers.get("content-length");
    if (contentLength && contentLength !== "0") {
      try {
        const body = await request.json();
        const validated = markPaidSchema.parse(body);
        if (validated.paidAt) {
          paidAt = new Date(validated.paidAt);
        }
        if (validated.applySkonto) {
          applySkonto = true;
        }
      } catch (err) {
        return apiError("BAD_REQUEST", 400, {
          message: "Ungültiger Body",
          details: { error: err instanceof Error ? err.message : String(err) },
        });
      }
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
        paidAmount: true,
        taxCodeId: true,
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

    // P11: §17 USt-Korrektur bei Skonto erzeugen.
    // Update + Korrekturbuchung in EINER Transaktion, damit beides atomar wird.
    // Nur ausführen wenn (a) Skonto angewendet wird, (b) TaxCode gesetzt ist
    // (sonst kein Auto-Split möglich), (c) Tenant nicht §19 Kleinunternehmer
    // ist (sonst hat die "USt-Korrektur" nichts zu korrigieren).
    const settings = await getTenantSettings(check.tenantId!);
    const shouldAdjustUSt =
      skontoPaid &&
      !settings.kleinunternehmer &&
      invoice.taxCodeId !== null &&
      invoice.skontoAmount !== null &&
      Number(invoice.skontoAmount) > 0;

    // K-2-Fix: recordPayment() statt direkt status=PAID setzen.
    // Garantiert konsistente paidAmount + InvoicePayment-Audit-Trail.
    // Bei Skonto: gezahlter Betrag = grossAmount - skontoAmount.
    const grossDec = new Decimal(invoice.grossAmount);
    const paidBeforeDec = new Decimal(invoice.paidAmount ?? 0);
    const skontoDeductionDec =
      skontoPaid && invoice.skontoAmount
        ? new Decimal(invoice.skontoAmount)
        : new Decimal(0);
    const remainingDec = grossDec.minus(paidBeforeDec).minus(skontoDeductionDec);

    if (remainingDec.lessThanOrEqualTo(0)) {
      return apiError("BAD_REQUEST", 400, {
        message: "Rechnung hat keinen offenen Restbetrag mehr",
      });
    }

    let ustAdjustmentId: string | null = null;
    const updated = await prisma.$transaction(async (tx) => {
      await recordPayment(tx, {
        tenantId: check.tenantId!,
        invoiceId: id,
        amount: remainingDec.toNumber(),
        paymentDate: paidAt,
        userId: check.userId!,
        notes: skontoPaid
          ? `Mark as paid mit Skonto ${invoice.skontoPercent}%`
          : "Mark as paid",
      });

      // Bei Skonto-Anwendung Skonto-Flag setzen
      const inv = await tx.invoice.update({
        where: { id, tenantId: check.tenantId! },
        data: {
          ...(skontoPaid && { skontoPaid: true }),
        },
        include: {
          items: { orderBy: { position: "asc" } },
        },
      });

      if (shouldAdjustUSt) {
        // Skonto = Entgeltminderung → grossDelta negativ.
        const skontoGross = Number(invoice.skontoAmount);
        try {
          const adjResult = await createUStAdjustment(tx, {
            tenantId: check.tenantId!,
            originalInvoiceId: id,
            reason: "SKONTO",
            adjustmentDate: paidAt,
            grossDelta: -skontoGross,
            userId: check.userId!,
            revenueAccount: settings.datevAccountEinspeisung,
            counterAccount: settings.datevAccountReceivables,
            notes: `Skonto ${invoice.skontoPercent}% auf RG ${id}`,
          });
          ustAdjustmentId = adjResult.adjustmentId;
        } catch (err) {
          if (err instanceof PeriodLockedError) {
            // Periode für Zahlungs-/Korrektur-Datum ist gesperrt.
            // Wir rollen die ganze Transaktion zurück — User muss erst entsperren.
            throw err;
          }
          throw err;
        }
      }

      return inv;
    });

    if (ustAdjustmentId) {
      logger.info(
        { invoiceId: id, ustAdjustmentId, tenantId: check.tenantId },
        "§17 UStG Skonto-Korrektur gebucht",
      );
      // K-1-Fix: §17-Korrekturbuchung ist POSTED → Reports-Cache invalidieren.
      invalidateReportsCache(check.tenantId!).catch((err) => {
        logger.warn(
          { err, invoiceId: id },
          "[Reports-Cache] Invalidation failed after §17 UStG Skonto-Korrektur",
        );
      });
    }

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
    if (error instanceof PeriodLockedError) {
      return apiError("PERIOD_LOCKED", 409, {
        message: error.message,
        details: { periodYear: error.periodYear, periodMonth: error.periodMonth },
      });
    }
    logger.error({ err: error }, "Error marking invoice as paid");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Markieren als bezahlt" });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client-runtime-utils";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";
import { apiError } from "@/lib/api-errors";
import {
  recordPayment,
  OverpaymentError,
  InvoiceNotPayableError,
} from "@/lib/accounting/invoice-payment";

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const confirmationSchema = z.object({
  confirmations: z
    .array(
      z.object({
        invoiceId: z.string().uuid("Ungültige Rechnungs-ID"),
        paidAt: z.string().datetime("Ungültiges Datum"),
        paymentReference: z.string().max(200).optional(),
      })
    )
    .min(1, "Keine Bestätigungen übergeben")
    .max(500, "Maximal 500 Bestätigungen pro Anfrage"),
});

// ============================================================================
// POST /api/invoices/bank-import/confirm
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();
    const parsed = confirmationSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return apiError("BAD_REQUEST", undefined, { message: firstError?.message || "Ungültige Eingabedaten", details: parsed.error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })) });
    }

    const { confirmations } = parsed.data;

    // Verify all invoices belong to this tenant + load paidAmount für Restbetrags-Berechnung
    const invoiceIds = confirmations.map((c) => c.invoiceId);
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        tenantId: check.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        grossAmount: true,
        paidAmount: true,
      },
    });

    const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

    let confirmed = 0;
    const errors: string[] = [];

    // Pro Bestätigung recordPayment() in eigener Transaktion mit Row-Lock.
    // Schließt UI-State, paidAmount, InvoicePayment-Audit zusammen.
    for (const conf of confirmations) {
      const invoice = invoiceMap.get(conf.invoiceId);

      if (!invoice) {
        errors.push(
          `Rechnung ${conf.invoiceId} nicht gefunden oder gehört nicht zum Mandanten`
        );
        continue;
      }

      // Akzeptierte Status für Bank-Import: SENT, PARTIALLY_PAID
      if (
        invoice.status !== "SENT" &&
        invoice.status !== "PARTIALLY_PAID"
      ) {
        errors.push(
          `Rechnung ${invoice.invoiceNumber} hat Status "${invoice.status}" (erwartet: SENT/PARTIALLY_PAID)`
        );
        continue;
      }

      // Restbetrag = gross - paidAmount
      const remaining = new Decimal(invoice.grossAmount)
        .minus(new Decimal(invoice.paidAmount ?? 0))
        .toDecimalPlaces(2);

      if (remaining.lessThanOrEqualTo(0)) {
        errors.push(
          `Rechnung ${invoice.invoiceNumber}: kein offener Restbetrag`,
        );
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          await recordPayment(tx, {
            tenantId: check.tenantId!,
            invoiceId: conf.invoiceId,
            amount: remaining.toNumber(),
            paymentDate: new Date(conf.paidAt),
            paymentMethod: "BANK",
            userId: check.userId!,
            notes: `Bank-Import${conf.paymentReference ? ` · Ref: ${conf.paymentReference}` : ""}`,
          });

          if (conf.paymentReference) {
            await tx.invoice.update({
              where: { id: conf.invoiceId, tenantId: check.tenantId! },
              data: { paymentReference: conf.paymentReference },
            });
          }
        });

        confirmed++;

        // Fire-and-forget webhook
        dispatchWebhook(check.tenantId!, "invoice.paid", {
          invoiceId: conf.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          paidAt: conf.paidAt,
          amount: remaining.toNumber(),
          source: "bank-import",
        }).catch(() => {
          // Webhook errors must not fail the response
        });
      } catch (err) {
        if (err instanceof OverpaymentError) {
          errors.push(
            `Rechnung ${invoice.invoiceNumber}: Überzahlung — bitte als Gutschrift abwickeln`,
          );
        } else if (err instanceof InvoiceNotPayableError) {
          errors.push(
            `Rechnung ${invoice.invoiceNumber}: nicht zahlbar (${err.status})`,
          );
        } else {
          errors.push(
            `Fehler bei Rechnung ${invoice.invoiceNumber}: ${
              err instanceof Error ? err.message : "Datenbankfehler"
            }`,
          );
        }
      }
    }

    logger.info(
      {
        userId: check.userId,
        tenantId: check.tenantId,
        confirmed,
        failed: errors.length,
        total: confirmations.length,
      },
      "Bank import confirmations processed"
    );

    return NextResponse.json({
      confirmed,
      failed: errors.length,
      errors,
    });
  } catch (error) {
    logger.error({ err: error }, "Error confirming bank import");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Bestätigen der Zahlungen" });
  }
}

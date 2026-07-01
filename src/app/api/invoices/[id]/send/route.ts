import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";
import { createAutoPosting } from "@/lib/accounting/auto-posting";
import { apiError } from "@/lib/api-errors";
import { assertSendable, isSendableAssertionError } from "@/lib/invoices/assert-sendable";

// POST /api/invoices/[id]/send - Rechnung als versendet markieren
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Load invoice + items + tenant data for §14 UStG validation
    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        items: { select: { description: true, netAmount: true } },
      },
    });

    if (!invoice) {
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    if (invoice.status !== "DRAFT") {
      return apiError("BAD_REQUEST", undefined, { message: `Rechnung kann nicht versendet werden (Status: ${invoice.status})` });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId! },
      select: { name: true, taxId: true, vatId: true, address: true, city: true, postalCode: true, street: true },
    });
    if (!tenant) {
      return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
    }

    // §14 UStG Pflichtangaben-Validierung vor DRAFT→SENT-Transition
    try {
      assertSendable(invoice, tenant);
    } catch (err) {
      if (isSendableAssertionError(err)) {
        return apiError("VALIDATION_FAILED", 422, {
          message: err.message,
          details: { missing: err.missing },
        });
      }
      throw err;
    }

    // Race-Guard: Status-Bedingung in die WHERE-Clause des Updates.
    // Bei Doppel-Klick oder parallelen Requests würde der zweite Update
    // sonst DRAFT→SENT auf einer bereits SENT-Rechnung machen und
    // sentAt sowie sofort folgendes auto-posting/webhook doppelt feuern.
    // `updateMany` gibt count zurück — 0 heißt: schon versendet.
    const updateResult = await prisma.invoice.updateMany({
      where: { id, tenantId: check.tenantId!, status: "DRAFT" },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      // Ein paralleler Request hat die Rechnung zwischen findFirst und update
      // versendet — kein Fehler, aber auch kein zweites auto-posting/webhook.
      return apiError("CONFLICT", 409, {
        message: "Rechnung wurde bereits versendet",
      });
    }

    const updated = await prisma.invoice.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        items: { orderBy: { position: "asc" } },
      },
    });

    if (!updated) {
      // Kann nur passieren wenn zwischen update und findFirst gelöscht wurde
      // (praktisch nie — Invoices sind soft-delete). Defensiv abfangen.
      return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden nach Update" });
    }

    // Fire-and-forget auto-posting
    createAutoPosting(id, check.userId!, check.tenantId!).catch((err) => {
      logger.warn({ err, invoiceId: id }, "[AutoPosting] Failed to create auto-posting");
    });

    // Fire-and-forget webhook dispatch
    dispatchWebhook(check.tenantId!, "invoice.sent", {
      id: updated.id,
      invoiceNumber: updated.invoiceNumber,
      sentAt: new Date().toISOString(),
    }).catch((err) => { logger.warn({ err }, "[Webhook] Dispatch failed"); });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "Error sending invoice");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Versenden der Rechnung" });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generateInvoicePdf } from "@/lib/pdf";
import { sendEmailSync } from "@/lib/email/sender";
import { apiLogger as logger } from "@/lib/logger";

interface SendResult {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: Array<{
    invoiceId: string;
    invoiceNumber: string;
    reason: string;
  }>;
}

// POST /api/admin/settlement-periods/[id]/send-all-invoices
// Batch-send all DRAFT/SENT invoices of a settlement period via email
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id: periodId } = await params;

    // Verify the settlement period exists and belongs to tenant
    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, tenantId: true, year: true, month: true, periodType: true },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Abrechnungsperiode nicht gefunden" },
        { status: 404 }
      );
    }

    if (period.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Load all invoices for this settlement period that are eligible for sending
    const invoices = await prisma.invoice.findMany({
      where: {
        settlementPeriodId: periodId,
        tenantId: check.tenantId!,
        deletedAt: null,
        status: { in: ["DRAFT", "SENT"] },
      },
      include: {
        items: { orderBy: { position: "asc" } },
        shareholder: { include: { person: { select: { email: true } } } },
        lease: { select: { lessor: { select: { email: true } } } },
      },
    });

    const result: SendResult = {
      total: invoices.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    if (invoices.length === 0) {
      return NextResponse.json(result);
    }

    logger.info(
      { periodId, invoiceCount: invoices.length },
      "Starting batch email send for settlement period"
    );

    // Process invoices sequentially to avoid overwhelming the mail server
    for (const invoice of invoices) {
      // Determine email address: Shareholder -> Person -> email, then Lease -> Lessor -> email
      let emailAddress: string | null | undefined = null;

      if (invoice.shareholder?.person?.email) {
        emailAddress = invoice.shareholder.person.email;
      } else if (invoice.lease?.lessor?.email) {
        emailAddress = invoice.lease.lessor.email;
      }

      // Skip invoices without a recipient email
      if (!emailAddress) {
        result.skipped++;
        result.errors.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          reason: "Keine E-Mail-Adresse vorhanden",
        });
        logger.info(
          { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
          "Skipped invoice: no email address"
        );
        continue;
      }

      try {
        // Generate PDF
        const pdfBuffer = await generateInvoicePdf(invoice.id);

        // Send email
        const emailResult = await sendEmailSync({
          to: emailAddress,
          subject: `Gutschrift ${invoice.invoiceNumber}`,
          html: `<p>Sehr geehrte Damen und Herren,</p><p>anbei erhalten Sie die Gutschrift Nr. ${invoice.invoiceNumber}.</p><p>Mit freundlichen Gruessen</p>`,
          attachments: [
            {
              filename: `Gutschrift_${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
          tenantId: check.tenantId!,
        });

        if (!emailResult.success) {
          result.failed++;
          result.errors.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            reason: `E-Mail-Versand fehlgeschlagen: ${emailResult.error}`,
          });
          logger.error(
            { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, error: emailResult.error },
            "Failed to send invoice email in batch"
          );
          continue;
        }

        // Update invoice: track email send + set status to SENT if currently DRAFT
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            emailedAt: new Date(),
            emailedById: check.userId,
            emailedTo: emailAddress,
            ...(invoice.status === "DRAFT"
              ? { status: "SENT", sentAt: new Date() }
              : {}),
          },
        });

        result.sent++;
        logger.info(
          { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, to: emailAddress },
          "Invoice email sent successfully in batch"
        );
      } catch (error) {
        // Catch per-invoice errors so the batch continues
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
        result.errors.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          reason: errorMessage,
        });
        logger.error(
          { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, err: error },
          "Unexpected error sending invoice email in batch"
        );
      }
    }

    logger.info(
      { periodId, sent: result.sent, skipped: result.skipped, failed: result.failed },
      "Batch email send completed for settlement period"
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error in batch send-all-invoices");
    return NextResponse.json(
      {
        error: "Fehler beim Massenversand der Gutschriften",
        details: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}

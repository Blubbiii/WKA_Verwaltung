import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generateInvoicePdf } from "@/lib/pdf";
import { sendEmailSync } from "@/lib/email/sender";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";

const MAX_BATCH_SIZE = 50;

// Statuses that should be skipped (not an error, just ignored)
const SKIP_STATUSES = new Set(["PAID", "CANCELLED"]);

interface BatchError {
  invoiceId: string;
  error: string;
}

interface BatchResult {
  sent: number;
  failed: number;
  skipped: number;
  errors: BatchError[];
}

// POST /api/invoices/batch-send - Mehrere Rechnungen per E-Mail versenden
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    // Parse and validate request body
    let body: { invoiceIds?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Ungueltiger Request Body" },
        { status: 400 }
      );
    }

    const { invoiceIds } = body;

    // Validate invoiceIds is a non-empty string array
    if (
      !Array.isArray(invoiceIds) ||
      invoiceIds.length === 0 ||
      !invoiceIds.every((id) => typeof id === "string" && id.length > 0)
    ) {
      return NextResponse.json(
        { error: "invoiceIds muss ein nicht-leeres Array von Strings sein" },
        { status: 400 }
      );
    }

    if (invoiceIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          error: `Maximal ${MAX_BATCH_SIZE} Rechnungen pro Batch erlaubt (erhalten: ${invoiceIds.length})`,
        },
        { status: 400 }
      );
    }

    // Deduplicate IDs
    const uniqueIds = [...new Set(invoiceIds)];

    logger.info(
      { count: uniqueIds.length, userId: check.userId },
      "Starting batch email send"
    );

    const result: BatchResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    // Process invoices sequentially to avoid overwhelming the email server
    for (const invoiceId of uniqueIds) {
      try {
        // Load invoice with tenant ownership check and all relations needed for PDF + email
        const invoice = await prisma.invoice.findFirst({
          where: {
            id: invoiceId,
            ...(check.tenantId ? { tenantId: check.tenantId } : {}),
          },
          include: {
            items: { orderBy: { position: "asc" } },
            fund: { select: { id: true, name: true, legalForm: true } },
            tenant: { select: { id: true, name: true } },
            shareholder: {
              include: {
                person: { select: { email: true } },
              },
            },
            lease: {
              select: {
                lessor: { select: { email: true } },
              },
            },
          },
        });

        // Invoice not found or not owned by tenant
        if (!invoice) {
          result.failed++;
          result.errors.push({
            invoiceId,
            error: "Rechnung nicht gefunden oder kein Zugriff",
          });
          continue;
        }

        // Skip already PAID or CANCELLED invoices gracefully
        if (SKIP_STATUSES.has(invoice.status)) {
          result.skipped++;
          logger.debug(
            { invoiceId, status: invoice.status },
            "Skipping invoice with terminal status"
          );
          continue;
        }

        // Resolve email address: Shareholder Person > Lease Lessor
        let emailAddress: string | null | undefined;

        if (invoice.shareholder?.person?.email) {
          emailAddress = invoice.shareholder.person.email;
        } else if (invoice.lease?.lessor?.email) {
          emailAddress = invoice.lease.lessor.email;
        }

        if (!emailAddress) {
          result.failed++;
          result.errors.push({
            invoiceId,
            error: `Keine E-Mail-Adresse fuer Rechnung ${invoice.invoiceNumber}`,
          });
          continue;
        }

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
            invoiceId,
            error: `E-Mail-Versand fehlgeschlagen: ${emailResult.error}`,
          });
          logger.error(
            { invoiceId, to: emailAddress, error: emailResult.error },
            "Batch send: failed to send invoice email"
          );
          continue;
        }

        // Update invoice: email tracking + set status to SENT if DRAFT
        await prisma.invoice.update({
          where: { id: invoiceId },
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
          { invoiceId, to: emailAddress },
          "Batch send: invoice email sent successfully"
        );
      } catch (error) {
        result.failed++;
        result.errors.push({
          invoiceId,
          error:
            error instanceof Error ? error.message : "Unbekannter Fehler",
        });
        logger.error(
          { invoiceId, err: error },
          "Batch send: unexpected error processing invoice"
        );
      }
    }

    logger.info(
      {
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        userId: check.userId,
      },
      "Batch email send completed"
    );

    return NextResponse.json(serializePrisma(result));
  } catch (error) {
    logger.error({ err: error }, "Error in batch invoice email send");
    return NextResponse.json(
      {
        error: "Fehler beim Batch-E-Mail-Versand",
        details:
          error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}

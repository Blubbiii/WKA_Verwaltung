import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generateInvoicePdf } from "@/lib/pdf";
import { sendEmailSync } from "@/lib/email/sender";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { API_LIMITS } from "@/lib/config/api-limits";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const batchSendSchema = z.object({
  invoiceIds: z.array(z.string().min(1)).min(1).max(API_LIMITS.batchSize),
});

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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungueltiger Request Body" });
    }

    const parsed = batchSendSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { invoiceIds } = parsed.data;

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

    // Batch-load all invoices upfront (single DB query instead of N queries)
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: uniqueIds },
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
    const invoicesMap = new Map(invoices.map((inv) => [inv.id, inv]));

    // Process invoices sequentially to avoid overwhelming the email server
    for (const invoiceId of uniqueIds) {
      try {
        // Look up invoice from pre-loaded map
        const invoice = invoicesMap.get(invoiceId) ?? null;

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
        const isCredit = invoice.invoiceType === "CREDIT_NOTE";
        const docLabel = isCredit ? "Gutschrift" : "Rechnung";
        const emailResult = await sendEmailSync({
          to: emailAddress,
          subject: `${docLabel} ${invoice.invoiceNumber}`,
          html: `<p>Sehr geehrte Damen und Herren,</p><p>anbei erhalten Sie die ${docLabel} Nr. ${invoice.invoiceNumber}.</p><p>Mit freundlichen Grüßen</p>`,
          attachments: [
            {
              filename: `${docLabel}_${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`,
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
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Batch-E-Mail-Versand", details: error instanceof Error ? error.message : "Unbekannter Fehler" });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { generateInvoicePdf } from "@/lib/pdf/generators/invoicePdf";
import { sendEmailSync } from "@/lib/email/sender";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const deliverSchema = z.object({
  method: z.enum(["print", "email", "both"]),
  invoiceIds: z.array(z.string().min(1)).optional(),
});

// =============================================================================
// POST /api/leases/settlement/[id]/deliver - Batch deliver credit notes
//
// Processes all credit notes (Gutschriften) for a settlement:
// - "print": marks invoices as printed
// - "email": generates PDFs, sends via email, marks as emailed
// - "both": print + email
// =============================================================================

interface DeliverResult {
  delivered: number;
  printed: number;
  emailed: number;
  errors: string[];
  total: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    // Fail-safe: tenantId must be present to prevent cross-tenant data access
    if (!check.tenantId) {
      return apiError("MISSING_FIELD", 403, { message: "Tenant-Kontext fehlt" });
    }

    const { id } = await params;

    const body = await request.json();
    const parsed = deliverSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { method, invoiceIds } = parsed.data;

    // Load settlement with all items that have invoices
    const settlement = await prisma.leaseRevenueSettlement.findFirst({
      where: { id, tenantId: check.tenantId },
      include: {
        items: {
          include: {
            advanceInvoice: {
              include: {
                items: { orderBy: { position: "asc" } },
                fund: { select: { id: true, name: true, legalForm: true } },
                tenant: { select: { id: true, name: true } },
              },
            },
            settlementInvoice: {
              include: {
                items: { orderBy: { position: "asc" } },
                fund: { select: { id: true, name: true, legalForm: true } },
                tenant: { select: { id: true, name: true } },
              },
            },
            lessorPerson: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                companyName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!settlement) {
      return apiError("NOT_FOUND", undefined, { message: "Abrechnung nicht gefunden" });
    }

    // Collect all invoices from items (advanceInvoice + settlementInvoice)
    const invoiceEntries: Array<{
      invoice: NonNullable<
        (typeof settlement.items)[number]["advanceInvoice"]
      >;
      item: (typeof settlement.items)[number];
    }> = [];

    for (const item of settlement.items) {
      if (item.advanceInvoice) {
        invoiceEntries.push({ invoice: item.advanceInvoice, item });
      }
      if (item.settlementInvoice) {
        invoiceEntries.push({ invoice: item.settlementInvoice, item });
      }
    }

    // Filter by invoiceIds if provided
    const filteredEntries = invoiceIds
      ? invoiceEntries.filter((entry) =>
          invoiceIds.includes(entry.invoice.id)
        )
      : invoiceEntries;

    if (filteredEntries.length === 0) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Gutschriften zum Zustellen gefunden", details: "Es wurden keine Rechnungen/Gutschriften in dieser Abrechnung gefunden." });
    }

    const result: DeliverResult = {
      delivered: 0,
      printed: 0,
      emailed: 0,
      errors: [],
      total: filteredEntries.length,
    };

    // Process based on method
    if (method === "print" || method === "both") {
      await processPrint(filteredEntries, check.userId!, result);
    }

    if (method === "email" || method === "both") {
      await processEmail(
        filteredEntries,
        check.userId!,
        check.tenantId!,
        result
      );
    }

    // Count delivered = unique invoices that were either printed or emailed
    result.delivered = Math.max(result.printed, result.emailed);

    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      { err: error },
      "Error delivering credit notes for lease revenue settlement"
    );
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Zustellen der Gutschriften" });
  }
}

// =============================================================================
// Print Processing
// =============================================================================

async function processPrint(
  entries: Array<{
    invoice: { id: string; invoiceNumber: string };
    item: { lessorPerson: { firstName: string | null; lastName: string | null; companyName: string | null } | null };
  }>,
  userId: string,
  result: DeliverResult
) {
  const successfulIds: string[] = [];

  for (const entry of entries) {
    try {
      // Generate PDF to validate it can be created (side effect: caches template)
      await generateInvoicePdf(entry.invoice.id);
      successfulIds.push(entry.invoice.id);
      result.printed++;
    } catch (error) {
      const lessorName = getLessorDisplayName(entry.item.lessorPerson);
      const message =
        error instanceof Error ? error.message : "Unbekannter Fehler";
      result.errors.push(
        `Gutschrift ${entry.invoice.invoiceNumber}: Druckfehler für ${lessorName} - ${message}`
      );
      logger.error(
        { err: error, invoiceId: entry.invoice.id },
        "Error printing invoice in batch delivery"
      );
    }
  }

  // Batch-update all successful prints (1 query instead of N)
  if (successfulIds.length > 0) {
    await prisma.invoice.updateMany({
      where: { id: { in: successfulIds } },
      data: {
        printedAt: new Date(),
        printedById: userId,
      },
    });
  }
}

// =============================================================================
// Email Processing
// =============================================================================

async function processEmail(
  entries: Array<{
    invoice: {
      id: string;
      invoiceNumber: string;
      status: string;
      tenantId: string;
      tenant: { id: string; name: string } | null;
    };
    item: {
      lessorPerson: {
        firstName: string | null;
        lastName: string | null;
        companyName: string | null;
        email: string | null;
      } | null;
    };
  }>,
  userId: string,
  tenantId: string,
  result: DeliverResult
) {
  for (const entry of entries) {
    try {
      const email = entry.item.lessorPerson?.email;
      const lessorName = getLessorDisplayName(entry.item.lessorPerson);

      // Validate email address exists
      if (!email) {
        result.errors.push(
          `Gutschrift ${entry.invoice.invoiceNumber}: Keine E-Mail-Adresse für Eigentuemer ${lessorName}`
        );
        continue;
      }

      // Generate PDF for attachment
      const pdfBuffer = await generateInvoicePdf(entry.invoice.id);

      // Send email with PDF attachment
      const tenantName =
        entry.invoice.tenant?.name || "WindparkManager";
      const emailResult = await sendEmailSync({
        to: email,
        subject: `Gutschrift ${entry.invoice.invoiceNumber} - ${tenantName}`,
        html: buildEmailHtml(
          entry.invoice.invoiceNumber,
          lessorName,
          tenantName
        ),
        text: buildEmailText(
          entry.invoice.invoiceNumber,
          lessorName,
          tenantName
        ),
        tenantId,
        attachments: [
          {
            filename: `${entry.invoice.invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      if (!emailResult.success) {
        result.errors.push(
          `Gutschrift ${entry.invoice.invoiceNumber}: E-Mail-Versand fehlgeschlagen für ${lessorName} - ${emailResult.error}`
        );
        logger.error(
          {
            invoiceId: entry.invoice.id,
            email,
            error: emailResult.error,
          },
          "Email send failed in batch delivery"
        );
        continue;
      }

      // Update invoice with email tracking data
      const updateData: Record<string, unknown> = {
        emailedAt: new Date(),
        emailedById: userId,
        emailedTo: email,
      };

      // If invoice is DRAFT, transition to SENT
      if (entry.invoice.status === "DRAFT") {
        updateData.status = "SENT";
        updateData.sentAt = new Date();
      }

      await prisma.invoice.update({
        where: { id: entry.invoice.id },
        data: updateData,
      });

      result.emailed++;
    } catch (error) {
      const lessorName = getLessorDisplayName(entry.item.lessorPerson);
      const message =
        error instanceof Error ? error.message : "Unbekannter Fehler";
      result.errors.push(
        `Gutschrift ${entry.invoice.invoiceNumber}: E-Mail-Fehler für ${lessorName} - ${message}`
      );
      logger.error(
        { err: error, invoiceId: entry.invoice.id },
        "Error emailing invoice in batch delivery"
      );
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function getLessorDisplayName(
  lessorPerson: {
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
  } | null
): string {
  if (!lessorPerson) return "Unbekannt";
  if (lessorPerson.companyName) return lessorPerson.companyName;
  const parts = [lessorPerson.firstName, lessorPerson.lastName].filter(
    Boolean
  );
  return parts.length > 0 ? parts.join(" ") : "Unbekannt";
}

function buildEmailHtml(
  invoiceNumber: string,
  lessorName: string,
  tenantName: string
): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Gutschrift ${invoiceNumber}</h2>
      <p>Sehr geehrte(r) ${lessorName},</p>
      <p>anbei erhalten Sie Ihre Gutschrift <strong>${invoiceNumber}</strong> als PDF-Dokument.</p>
      <p>Bei Rückfragen stehen wir Ihnen gerne zur Verfuegung.</p>
      <p>Mit freundlichen Gruessen<br/>${tenantName}</p>
    </div>
  `;
}

function buildEmailText(
  invoiceNumber: string,
  lessorName: string,
  tenantName: string
): string {
  return [
    `Gutschrift ${invoiceNumber}`,
    "",
    `Sehr geehrte(r) ${lessorName},`,
    "",
    `anbei erhalten Sie Ihre Gutschrift ${invoiceNumber} als PDF-Dokument.`,
    "",
    "Bei Rückfragen stehen wir Ihnen gerne zur Verfuegung.",
    "",
    `Mit freundlichen Gruessen`,
    tenantName,
  ].join("\n");
}

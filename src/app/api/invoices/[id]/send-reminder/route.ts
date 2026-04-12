import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateInvoicePdf } from "@/lib/pdf";
import { sendEmailSync } from "@/lib/email/sender";
import { renderEmail, getBaseTemplateProps } from "@/lib/email/renderer";
import { getTenantSettings } from "@/lib/tenant-settings";
import { dispatchWebhook } from "@/lib/webhooks";
import { formatDate } from "@/lib/format";
import { apiError } from "@/lib/api-errors";

// ============================================================================
// VALIDATION
// ============================================================================

const bodySchema = z.object({
  reminderLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  overrideEmail: z.email().optional(),
  lateFee: z.number().min(0).optional(),
});

const REMINDER_LABELS: Record<1 | 2 | 3, string> = {
  1: "1. Zahlungserinnerung",
  2: "1. Mahnung",
  3: "2. Mahnung / Letzte Mahnung",
};

const WATERMARK_TEXTS: Record<1 | 2 | 3, string> = {
  1: "ZAHLUNGSERINNERUNG",
  2: "1. MAHNUNG",
  3: "2. MAHNUNG",
};

// ============================================================================
// POST /api/invoices/[id]/send-reminder
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;

    // Parse + validate body
    let body: z.infer<typeof bodySchema>;
    try {
      const raw = await request.json();
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message || "Ungültige Eingabe" });
      }
      body = parsed.data;
    } catch {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiger Request-Body" });
    }

    const { reminderLevel, overrideEmail } = body;

    // Load invoice
    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      include: {
        fund: { select: { id: true, name: true } },
        tenant: { select: { id: true, name: true } },
        shareholder: {
          include: {
            person: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        lease: {
          select: { lessor: { select: { email: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!invoice) {
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    if (invoice.status !== "SENT") {
      return apiError("BAD_REQUEST", undefined, { message: `Mahnungen können nur für versendete Rechnungen erstellt werden (Status: ${invoice.status})` });
    }

    // Guard: reminderLevel must not go backwards
    if (invoice.reminderLevel && reminderLevel < invoice.reminderLevel) {
      return apiError("BAD_REQUEST", undefined, { message: `Mahnstufe kann nicht zurückgesetzt werden (aktuell: ${invoice.reminderLevel}, neu: ${reminderLevel})` });
    }

    // Determine lateFee: explicit override > TenantSettings
    let lateFee = body.lateFee;
    if (lateFee === undefined) {
      const settings = await getTenantSettings(check.tenantId);
      const feeKey = `reminderFee${reminderLevel}` as "reminderFee1" | "reminderFee2" | "reminderFee3";
      lateFee = settings[feeKey] ?? 0;
    }

    // Resolve email address: override > shareholder > lessor
    const emailAddress =
      overrideEmail ||
      invoice.shareholder?.person?.email ||
      invoice.lease?.lessor?.email ||
      null;

    if (!emailAddress) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine E-Mail-Adresse für diese Rechnung hinterlegt" });
    }

    // Resolve recipient name
    const recipientName =
      invoice.shareholder?.person
        ? `${invoice.shareholder.person.firstName} ${invoice.shareholder.person.lastName}`.trim()
        : invoice.lease?.lessor
        ? `${invoice.lease.lessor.firstName} ${invoice.lease.lessor.lastName}`.trim()
        : "Sehr geehrte Damen und Herren";

    // Calculate days overdue
    const daysOverdue = invoice.dueDate
      ? Math.max(0, Math.floor((Date.now() - invoice.dueDate.getTime()) / 86_400_000))
      : 0;

    const reminderLabel = REMINDER_LABELS[reminderLevel];
    const watermarkText = WATERMARK_TEXTS[reminderLevel];

    // Format amounts
    const formattedAmount = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(Number(invoice.grossAmount));

    const formattedDueDate = formatDate(invoice.dueDate);

    // Generate PDF with dunning watermark
    const pdfBuffer = await generateInvoicePdf(invoice.id, {
      customWatermarkText: watermarkText,
    });

    // Render email
    const baseProps = await getBaseTemplateProps(check.tenantId);
    const { html, subject } = await renderEmail(
      "invoice-reminder",
      {
        ...baseProps,
        recipientName,
        invoiceNumber: invoice.invoiceNumber,
        amount: formattedAmount,
        dueDate: formattedDueDate,
        daysOverdue,
        reminderLevel,
        reminderLabel,
        lateFee,
      },
      check.tenantId
    );

    // Send email
    const pdfFilename = `${watermarkText.replace(/\s/g, "_")}_${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;

    const emailResult = await sendEmailSync({
      to: emailAddress,
      subject,
      html,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
      tenantId: check.tenantId,
    });

    if (!emailResult.success) {
      logger.error(
        { invoiceId: id, to: emailAddress, error: emailResult.error },
        "Failed to send reminder email"
      );
      return apiError("INTERNAL_ERROR", undefined, { message: `E-Mail-Versand fehlgeschlagen: ${emailResult.error}` });
    }

    // Update invoice
    await prisma.invoice.update({
      where: { id },
      data: {
        reminderLevel,
        reminderSentAt: new Date(),
        emailedAt: new Date(),
        emailedTo: emailAddress,
        emailedById: check.userId,
      },
    });

    // Fire-and-forget webhook
    dispatchWebhook(check.tenantId, "invoice.reminder_sent", {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      reminderLevel,
      lateFee,
      emailedTo: emailAddress,
    }).catch((err) => logger.error({ err }, "[Audit] Failed to dispatch reminder webhook"));

    logger.info(
      { userId: check.userId, tenantId: check.tenantId, invoiceId: id, reminderLevel, lateFee },
      "Invoice reminder sent"
    );

    return NextResponse.json({
      success: true,
      reminderLevel,
      emailedTo: emailAddress,
      lateFee,
    });
  } catch (error) {
    logger.error({ err: error }, "Error sending invoice reminder");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Versenden der Mahnung", details: error instanceof Error ? error.message : "Unbekannter Fehler" });
  }
}

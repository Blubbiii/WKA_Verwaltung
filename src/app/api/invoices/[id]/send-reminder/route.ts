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

// ============================================================================
// VALIDATION
// ============================================================================

const bodySchema = z.object({
  reminderLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  overrideEmail: z.string().email().optional(),
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
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
    }

    const { id } = await params;

    // Parse + validate body
    let body: z.infer<typeof bodySchema>;
    try {
      const raw = await request.json();
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.errors[0]?.message || "Ungültige Eingabe" },
          { status: 400 }
        );
      }
      body = parsed.data;
    } catch {
      return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
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
      return NextResponse.json({ error: "Rechnung nicht gefunden" }, { status: 404 });
    }

    if (invoice.status !== "SENT") {
      return NextResponse.json(
        {
          error: `Mahnungen können nur für versendete Rechnungen erstellt werden (Status: ${invoice.status})`,
        },
        { status: 400 }
      );
    }

    // Guard: reminderLevel must not go backwards
    if (invoice.reminderLevel && reminderLevel < invoice.reminderLevel) {
      return NextResponse.json(
        {
          error: `Mahnstufe kann nicht zurückgesetzt werden (aktuell: ${invoice.reminderLevel}, neu: ${reminderLevel})`,
        },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Keine E-Mail-Adresse für diese Rechnung hinterlegt" },
        { status: 400 }
      );
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

    const formattedDueDate = invoice.dueDate
      ? invoice.dueDate.toLocaleDateString("de-DE")
      : "—";

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
      return NextResponse.json(
        { error: `E-Mail-Versand fehlgeschlagen: ${emailResult.error}` },
        { status: 500 }
      );
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
    }).catch(() => {});

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
    return NextResponse.json(
      {
        error: "Fehler beim Versenden der Mahnung",
        details: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}

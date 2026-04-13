import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generateInvoicePdf } from "@/lib/pdf";
import { sendEmailSync } from "@/lib/email/sender";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// POST /api/invoices/[id]/email - Rechnung per E-Mail versenden
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Optionalen Body lesen (kann leer sein)
    let body: { to?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Leerer Body ist OK
    }

    // Rechnung laden mit allen Relationen für PDF und E-Mail-Ermittlung
    const invoice = await prisma.invoice.findFirst({
      where: { id, ...(check.tenantId ? { tenantId: check.tenantId } : {}) },
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

    if (!invoice) {
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    // E-Mail-Adresse ermitteln: Body > Shareholder Person > Lease Lessor
    let emailAddress = body.to;

    if (!emailAddress) {
      // Versuch 1: Shareholder -> Person -> email
      if (invoice.shareholder?.person?.email) {
        emailAddress = invoice.shareholder.person.email;
      }
      // Versuch 2: Lease -> Lessor (Person) -> email
      else if (invoice.lease?.lessor?.email) {
        emailAddress = invoice.lease.lessor.email;
      }
    }

    if (!emailAddress) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine E-Mail-Adresse" });
    }

    // PDF generieren
    const pdfBuffer = await generateInvoicePdf(invoice.id);

    // E-Mail versenden
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
      fundId: invoice.fundId ?? undefined,
    });

    if (!emailResult.success) {
      logger.error(
        { invoiceId: id, to: emailAddress, error: emailResult.error },
        "Failed to send invoice email"
      );
      return apiError("INTERNAL_ERROR", undefined, { message: `E-Mail-Versand fehlgeschlagen: ${emailResult.error}` });
    }

    // Rechnung aktualisieren: E-Mail-Tracking + ggf. Status auf SENT setzen
    await prisma.invoice.update({
      where: { id, tenantId: check.tenantId!},
      data: {
        emailedAt: new Date(),
        emailedById: check.userId,
        emailedTo: emailAddress,
        // Bei DRAFT automatisch als versendet markieren
        ...(invoice.status === "DRAFT"
          ? { status: "SENT", sentAt: new Date() }
          : {}),
      },
    });

    return NextResponse.json(
      serializePrisma({ success: true, emailedTo: emailAddress })
    );
  } catch (error) {
    logger.error({ err: error }, "Error emailing invoice");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim E-Mail-Versand", details: error instanceof Error ? error.message : "Unbekannter Fehler" });
  }
}

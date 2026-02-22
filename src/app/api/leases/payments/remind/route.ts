import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// Validation schema for remind request
const remindSchema = z.object({
  paymentId: z.string().min(1, "Payment ID ist erforderlich"),
  leaseId: z.string().uuid("Ungueltige Lease ID"),
  lessorName: z.string().min(1),
  amount: z.number().positive("Betrag muss positiv sein"),
  dueDate: z.string().min(1, "Faelligkeitsdatum ist erforderlich"),
  parkName: z.string().nullable().optional(),
  contractInfo: z.string().optional(),
});

/**
 * Format a number as EUR currency string (German locale)
 */
function formatCurrencyForEmail(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

/**
 * Build the payment reminder HTML email
 */
function buildReminderHtml(params: {
  lessorName: string;
  amount: string;
  dueDate: string;
  contractInfo: string;
  parkName: string;
  tenantName: string;
  bankName: string;
  iban: string;
  bic: string;
  primaryColor: string;
}): { html: string; text: string } {
  const {
    lessorName,
    amount,
    dueDate,
    contractInfo,
    parkName,
    tenantName,
    bankName,
    iban,
    bic,
    primaryColor,
  } = params;

  const year = new Date().getFullYear();

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8" /></head>
<body style="background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;">
  <div style="background-color:#ffffff;margin:40px auto;max-width:600px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">
    <!-- Header -->
    <div style="padding:24px 32px;text-align:center;">
      <p style="font-size:24px;font-weight:700;color:${primaryColor};margin:0;">${tenantName}</p>
    </div>
    <hr style="border:none;border-top:2px solid ${primaryColor};margin:0;" />

    <!-- Content -->
    <div style="padding:32px;">
      <h1 style="font-size:24px;font-weight:600;color:#1f2937;margin:0 0 16px;">Zahlungserinnerung</h1>

      <p style="font-size:16px;line-height:26px;color:#4b5563;margin:0 0 16px;">
        Sehr geehrte/r ${lessorName},
      </p>

      <p style="font-size:16px;line-height:26px;color:#4b5563;margin:0 0 16px;">
        wir erlauben uns, Sie an die ausstehende Pachtzahlung zu erinnern.
        Die nachfolgende Zahlung ist faellig bzw. ueberfaellig:
      </p>

      <!-- Payment Details -->
      <div style="background-color:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;padding:16px 20px;margin:24px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;width:40%;">Vertrag / Flurstueck:</td>
            <td style="padding:4px 0;font-size:14px;color:#1f2937;font-weight:500;">${contractInfo}</td>
          </tr>
          ${parkName ? `
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;">Windpark:</td>
            <td style="padding:4px 0;font-size:14px;color:#1f2937;font-weight:500;">${parkName}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;">Faellig am:</td>
            <td style="padding:4px 0;font-size:14px;color:#991b1b;font-weight:600;">${dueDate}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;">Betrag:</td>
            <td style="padding:4px 0;font-size:18px;color:#dc2626;font-weight:700;">${amount}</td>
          </tr>
        </table>
      </div>

      ${bankName || iban ? `
      <!-- Bank Details -->
      <div style="background-color:#f0fdf4;border-radius:6px;padding:16px 20px;margin:24px 0;">
        <p style="font-size:14px;color:#065f46;font-weight:600;margin:0 0 8px;">Bankverbindung</p>
        <table style="width:100%;border-collapse:collapse;">
          ${bankName ? `<tr>
            <td style="padding:2px 0;font-size:13px;color:#047857;width:40%;">Bank:</td>
            <td style="padding:2px 0;font-size:13px;color:#047857;">${bankName}</td>
          </tr>` : ""}
          ${iban ? `<tr>
            <td style="padding:2px 0;font-size:13px;color:#047857;">IBAN:</td>
            <td style="padding:2px 0;font-size:13px;color:#047857;font-family:monospace;">${iban}</td>
          </tr>` : ""}
          ${bic ? `<tr>
            <td style="padding:2px 0;font-size:13px;color:#047857;">BIC:</td>
            <td style="padding:2px 0;font-size:13px;color:#047857;font-family:monospace;">${bic}</td>
          </tr>` : ""}
        </table>
      </div>` : ""}

      <p style="font-size:16px;line-height:26px;color:#4b5563;margin:0 0 16px;">
        Bitte ueberweisen Sie den ausstehenden Betrag unter Angabe des Vertragsbezugs
        als Verwendungszweck. Sollte die Zahlung bereits veranlasst sein, betrachten
        Sie diese Erinnerung bitte als gegenstandslos.
      </p>

      <p style="font-size:16px;line-height:26px;color:#4b5563;margin:0 0 16px;">
        Bei Fragen stehen wir Ihnen gerne zur Verfuegung.
      </p>

      <p style="font-size:16px;line-height:26px;color:#4b5563;margin:0 0 16px;">
        Mit freundlichen Gruessen,<br />
        Ihr ${tenantName} Team
      </p>
    </div>

    <!-- Footer -->
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
    <div style="background-color:#f9fafb;padding:24px 32px;text-align:center;">
      <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0 0 8px;">
        Diese E-Mail wurde automatisch von ${tenantName} versendet.
      </p>
      <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
        &copy; ${year} ${tenantName}. Alle Rechte vorbehalten.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Zahlungserinnerung

Sehr geehrte/r ${lessorName},

wir erlauben uns, Sie an die ausstehende Pachtzahlung zu erinnern.

Vertrag / Flurstueck: ${contractInfo}
${parkName ? `Windpark: ${parkName}\n` : ""}Faellig am: ${dueDate}
Betrag: ${amount}

${bankName || iban ? `Bankverbindung:
${bankName ? `Bank: ${bankName}\n` : ""}${iban ? `IBAN: ${iban}\n` : ""}${bic ? `BIC: ${bic}\n` : ""}` : ""}
Bitte ueberweisen Sie den ausstehenden Betrag unter Angabe des Vertragsbezugs als Verwendungszweck. Sollte die Zahlung bereits veranlasst sein, betrachten Sie diese Erinnerung bitte als gegenstandslos.

Bei Fragen stehen wir Ihnen gerne zur Verfuegung.

Mit freundlichen Gruessen,
Ihr ${tenantName} Team`;

  return { html, text };
}

// POST /api/leases/payments/remind
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();

    // Validate input
    const parsed = remindSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Eingabedaten", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { leaseId, lessorName, amount, dueDate, parkName, contractInfo } =
      parsed.data;

    // Fetch lease with lessor to get email address
    const lease = await prisma.lease.findFirst({
      where: {
        id: leaseId,
        tenantId: check.tenantId,
      },
      include: {
        lessor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
            personType: true,
          },
        },
      },
    });

    if (!lease) {
      return NextResponse.json(
        { error: "Pachtvertrag nicht gefunden" },
        { status: 404 }
      );
    }

    if (!lease.lessor.email) {
      return NextResponse.json(
        {
          error:
            "Fuer diesen Verpaechter ist keine E-Mail-Adresse hinterlegt. Bitte ergaenzen Sie die E-Mail-Adresse in den Kontaktdaten.",
        },
        { status: 422 }
      );
    }

    // Get tenant details for bank info and branding
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: {
        name: true,
        primaryColor: true,
        bankName: true,
        iban: true,
        bic: true,
      },
    });

    const tenantName = tenant?.name || "WindparkManager";
    const primaryColor = tenant?.primaryColor || "#3b82f6";

    // Format the due date for display
    const formattedDueDate = format(new Date(dueDate), "dd.MM.yyyy", {
      locale: de,
    });
    const formattedAmount = formatCurrencyForEmail(amount);

    // Build email content
    const { html, text } = buildReminderHtml({
      lessorName,
      amount: formattedAmount,
      dueDate: formattedDueDate,
      contractInfo: contractInfo || "-",
      parkName: parkName || "",
      tenantName,
      bankName: tenant?.bankName || "",
      iban: tenant?.iban || "",
      bic: tenant?.bic || "",
      primaryColor,
    });

    // Send the email
    const emailResult = await sendEmail({
      to: lease.lessor.email,
      subject: `Zahlungserinnerung - Pachtzahlung ${formattedDueDate} - ${tenantName}`,
      html,
      text,
      tenantId: check.tenantId!,
    });

    if (!emailResult.success) {
      logger.error(
        {
          error: emailResult.error,
          leaseId,
          lessorEmail: lease.lessor.email,
        },
        "Failed to send payment reminder email"
      );
      return NextResponse.json(
        {
          error:
            "E-Mail konnte nicht gesendet werden. Bitte pruefen Sie die E-Mail-Konfiguration.",
        },
        { status: 500 }
      );
    }

    logger.info(
      {
        leaseId,
        lessorId: lease.lessor.id,
        lessorEmail: lease.lessor.email,
        messageId: emailResult.messageId,
        userId: check.userId,
      },
      "Payment reminder email sent successfully"
    );

    return NextResponse.json({
      success: true,
      message: `Zahlungserinnerung wurde an ${lease.lessor.email} gesendet.`,
      email: lease.lessor.email,
    });
  } catch (error) {
    logger.error({ err: error }, "Error sending payment reminder");
    return NextResponse.json(
      { error: "Fehler beim Senden der Zahlungserinnerung" },
      { status: 500 }
    );
  }
}

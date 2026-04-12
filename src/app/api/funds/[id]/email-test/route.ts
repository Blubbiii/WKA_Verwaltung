import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { SmtpProvider } from "@/lib/email/provider";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const emailTestSchema = z.object({
  to: z.string().email("Ungültige E-Mail-Adresse"),
});

// POST /api/funds/[id]/email-test — Send test email via fund SMTP
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.FUNDS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const body = await request.json();
    const parsed = emailTestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const testTo = parsed.data.to;

    // Load fund with email settings
    const fund = await prisma.fund.findFirst({
      where: { id, tenantId: check.tenantId },
      select: {
        name: true,
        emailSmtpHost: true,
        emailSmtpPort: true,
        emailSmtpUser: true,
        emailSmtpPassword: true,
        emailSmtpSecure: true,
        emailFromAddress: true,
        emailFromName: true,
      },
    });

    if (!fund) {
      return apiError("NOT_FOUND", undefined, { message: "Gesellschaft nicht gefunden" });
    }

    if (!fund.emailSmtpHost || !fund.emailFromAddress) {
      return apiError("BAD_REQUEST", undefined, { message: "SMTP-Host und Absender-E-Mail müssen konfiguriert sein" });
    }

    // Create provider and send test
    const provider = new SmtpProvider(
      {
        host: fund.emailSmtpHost,
        port: fund.emailSmtpPort ?? 587,
        secure: fund.emailSmtpSecure ?? true,
        user: fund.emailSmtpUser ?? "",
        password: fund.emailSmtpPassword ?? "",
      },
      fund.emailFromAddress,
      fund.emailFromName ?? fund.name,
    );

    const result = await provider.send({
      to: testTo,
      subject: `Test-E-Mail von ${fund.emailFromName ?? fund.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2>Test-E-Mail erfolgreich</h2>
          <p>Diese E-Mail wurde über den SMTP-Server der Gesellschaft <strong>${fund.name}</strong> versendet.</p>
          <p style="color: #666; font-size: 12px;">
            SMTP: ${fund.emailSmtpHost}:${fund.emailSmtpPort ?? 587}<br/>
            Von: ${fund.emailFromName ?? fund.name} &lt;${fund.emailFromAddress}&gt;
          </p>
        </div>
      `,
    });

    if (result.success) {
      logger.info({ fundId: id, to: testTo }, "Fund test email sent successfully");
      return NextResponse.json({ success: true, message: "Test-E-Mail gesendet" });
    } else {
      logger.warn({ fundId: id, to: testTo, error: result.error }, "Fund test email failed");
      return apiError("INTERNAL_ERROR", undefined, { message: `Versand fehlgeschlagen: ${result.error}` });
    }
  } catch (error) {
    logger.error({ err: error }, "Error sending fund test email");
    return apiError("INTERNAL_ERROR", undefined, { message: error instanceof Error ? error.message : "Fehler beim Senden" });
  }
}

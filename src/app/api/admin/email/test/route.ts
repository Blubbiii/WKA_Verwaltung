/**
 * Admin Email Test API
 *
 * POST - Send a test email to verify configuration
 *
 * Authentication: SUPERADMIN only
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { testEmailConfiguration, verifyEmailProvider } from "@/lib/email";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Validation Schema
// =============================================================================

const testEmailSchema = z.object({
  to: z.string().email("Ungueltige E-Mail-Adresse"),
});

// =============================================================================
// POST /api/admin/email/test - Send test email
// =============================================================================

export async function POST(request: Request) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = testEmailSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { to } = parsed.data;

    // First verify the provider is configured correctly
    const isValid = await verifyEmailProvider(check.tenantId!);

    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error:
            "E-Mail-Provider-Verbindung fehlgeschlagen. Bitte ueberpruefen Sie die Konfiguration.",
        },
        { status: 400 }
      );
    }

    // Send the test email
    const result = await testEmailConfiguration(check.tenantId!, to);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test-E-Mail wurde erfolgreich an ${to} gesendet.`,
        messageId: result.messageId,
        provider: result.provider,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "E-Mail konnte nicht gesendet werden",
          provider: result.provider,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error({ err: error }, "[Admin Email Test API] Error");
    return NextResponse.json(
      { error: "Interner Serverfehler beim Senden der Test-E-Mail" },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET /api/admin/email/test - Verify email provider connection
// =============================================================================

export async function GET() {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const isValid = await verifyEmailProvider(check.tenantId!);

    return NextResponse.json({
      connected: isValid,
      message: isValid
        ? "E-Mail-Provider ist korrekt konfiguriert und verbunden."
        : "E-Mail-Provider-Verbindung fehlgeschlagen. Bitte ueberpruefen Sie die Konfiguration.",
    });
  } catch (error) {
    logger.error({ err: error }, "[Admin Email Test API] Verify error");
    return NextResponse.json(
      {
        connected: false,
        error: "Fehler beim Ueberpruefen der E-Mail-Konfiguration",
      },
      { status: 500 }
    );
  }
}

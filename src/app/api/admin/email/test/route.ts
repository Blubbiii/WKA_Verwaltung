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
import { apiError } from "@/lib/api-errors";

// =============================================================================
// Validation Schema
// =============================================================================

const testEmailSchema = z.object({
  to: z.string().email("Ungültige E-Mail-Adresse"),
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
      return apiError("VALIDATION_FAILED", undefined, { message: "Validierungsfehler", details: parsed.error.format() });
    }

    const { to } = parsed.data;

    // First verify the provider is configured correctly
    const isValid = await verifyEmailProvider(check.tenantId!);

    if (!isValid) {
      return apiError("BAD_REQUEST", 400, {
        message: "E-Mail-Provider-Verbindung fehlgeschlagen. Bitte überprüfen Sie die Konfiguration.",
      });
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
      return apiError("INTERNAL_ERROR", 500, {
        message: result.error || "E-Mail konnte nicht gesendet werden",
        details: { provider: result.provider },
      });
    }
  } catch (error) {
    logger.error({ err: error }, "[Admin Email Test API] Error");
    return apiError("PROCESS_FAILED", undefined, { message: "Interner Serverfehler beim Senden der Test-E-Mail" });
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
        : "E-Mail-Provider-Verbindung fehlgeschlagen. Bitte überprüfen Sie die Konfiguration.",
    });
  } catch (error) {
    logger.error({ err: error }, "[Admin Email Test API] Verify error");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Fehler beim Überprüfen der E-Mail-Konfiguration",
      details: { connected: false },
    });
  }
}

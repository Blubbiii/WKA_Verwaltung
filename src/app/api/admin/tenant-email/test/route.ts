/**
 * Tenant Email Test API
 *
 * POST - Test the tenant's email configuration
 *        Supports two test types:
 *        - "connection": Verify SMTP connection only
 *        - "email": Send a test email to a specified recipient
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  testEmailConfiguration,
  verifyEmailProvider,
} from "@/lib/email/sender";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const testRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connection"),
  }),
  z.object({
    type: z.literal("email"),
    recipient: z.string().email("Ungueltige Empfaenger-E-Mail-Adresse"),
  }),
]);

// =============================================================================
// POST /api/admin/tenant-email/test
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = testRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { type } = parsed.data;

    if (type === "connection") {
      // Test SMTP connection only (no email sent)
      const success = await verifyEmailProvider(check.tenantId!);

      return NextResponse.json({
        success,
        message: success
          ? "SMTP-Verbindung erfolgreich hergestellt"
          : "SMTP-Verbindung fehlgeschlagen. Bitte pruefen Sie die Zugangsdaten.",
      });
    }

    // type === "email": send a test email
    const { recipient } = parsed.data;

    logger.info(
      { tenantId: check.tenantId, recipient },
      "[Tenant Email Test] Sending test email"
    );

    const result = await testEmailConfiguration(check.tenantId!, recipient);

    return NextResponse.json({
      success: result.success,
      message: result.success
        ? `Test-E-Mail erfolgreich an ${recipient} gesendet`
        : `Test-E-Mail fehlgeschlagen: ${result.error || "Unbekannter Fehler"}`,
      messageId: result.messageId,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { err: error },
      "[Tenant Email Test] POST error: " + errMsg
    );
    return NextResponse.json(
      { error: "Fehler beim Testen der E-Mail-Konfiguration" },
      { status: 500 }
    );
  }
}

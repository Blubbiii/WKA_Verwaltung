/**
 * Tenant-Level Paperless-ngx Connection Test API
 *
 * POST - Test paperless connection for the current tenant (ADMIN+)
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { getPaperlessConfig } from "@/lib/config";

// =============================================================================
// POST /api/settings/paperless/test
// =============================================================================

export async function POST() {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const config = await getPaperlessConfig(check.tenantId);

    if (!config) {
      return NextResponse.json({
        success: false,
        error: "Paperless-ngx-Konfiguration nicht vorhanden",
        details: "URL und API Token muessen konfiguriert sein.",
      });
    }

    const { PaperlessClient } = await import("@/lib/paperless/client");
    const client = new PaperlessClient(config.url, config.token);
    const result = await client.testConnection();

    if (!result.success) {
      logger.warn(
        { url: config.url, error: result.error },
        "[Settings/Paperless Test] Connection failed"
      );
      return NextResponse.json({
        success: false,
        error: `Paperless-ngx-Verbindung fehlgeschlagen: ${result.error}`,
        details: result.error,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Paperless-ngx-Verbindung erfolgreich.",
      config: {
        url: config.url,
        autoArchive: config.autoArchive,
      },
      testData: {
        documentCount: result.documentCount,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Settings/Paperless Test] Error");

    const errorMessage =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    return NextResponse.json({
      success: false,
      error: "Paperless-ngx-Test fehlgeschlagen",
      details: errorMessage,
    });
  }
}

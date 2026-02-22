/**
 * Email Template Preview API
 *
 * POST - Render a template preview with sample data
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  replacePlaceholders,
  getBaseTemplateProps,
  getSampleData,
  type SupportedTemplateName,
} from "@/lib/email/renderer";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// CONSTANTS
// =============================================================================

const VALID_TEMPLATE_KEYS: SupportedTemplateName[] = [
  "welcome",
  "password-reset",
  "new-invoice",
  "vote-invitation",
  "tenant-admin-invitation",
  "portal-invitation",
  "vote-reminder",
  "vote-result",
  "document-shared",
  "settlement-notification",
  "news-announcement",
  "service-event",
  "report-ready",
];

// =============================================================================
// VALIDATION
// =============================================================================

const previewSchema = z.object({
  htmlContent: z.string().min(1, "Inhalt ist erforderlich"),
  subject: z.string().min(1, "Betreff ist erforderlich"),
});

// =============================================================================
// POST /api/admin/email-templates/[key]/preview
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { key } = await params;

    // Validate template key
    if (!VALID_TEMPLATE_KEYS.includes(key as SupportedTemplateName)) {
      return NextResponse.json(
        { error: "Unbekannte Vorlage" },
        { status: 404 }
      );
    }

    const templateKey = key as SupportedTemplateName;

    const body = await request.json();
    const parsed = previewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { htmlContent, subject } = parsed.data;

    // Get base template props (tenant name, logo, etc.)
    const baseProps = await getBaseTemplateProps(check.tenantId!);

    // Get sample data for this template type
    const sampleData = getSampleData(templateKey);

    // Merge all data for placeholder replacement
    const allData: Record<string, unknown> = {
      ...baseProps,
      ...sampleData,
    };

    // Replace placeholders in both subject and HTML
    const renderedSubject = replacePlaceholders(subject, allData);
    const renderedHtml = replacePlaceholders(htmlContent, allData);

    return NextResponse.json({
      subject: renderedSubject,
      html: renderedHtml,
    });
  } catch (error) {
    logger.error(
      { err: error },
      "[Email Templates API] POST [key]/preview error"
    );
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Vorschau" },
      { status: 500 }
    );
  }
}

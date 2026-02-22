/**
 * Email Template API - Single template operations
 *
 * GET    - Load a single template (custom from DB or built-in fallback)
 * PUT    - Save/update a custom template
 * DELETE - Remove custom template (revert to built-in)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import {
  previewTemplate,
  htmlToPlainText,
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

// Available placeholders per template
const TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  welcome: ["userName", "loginUrl", "tenantName", "appName", "currentYear"],
  "password-reset": [
    "userName",
    "resetUrl",
    "expiresIn",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "new-invoice": [
    "recipientName",
    "invoiceNumber",
    "amount",
    "dueDate",
    "downloadUrl",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "vote-invitation": [
    "shareholderName",
    "voteName",
    "voteDescription",
    "deadline",
    "voteUrl",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "tenant-admin-invitation": [
    "userName",
    "invitationUrl",
    "expiresIn",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "portal-invitation": [
    "userName",
    "email",
    "temporaryPassword",
    "loginUrl",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "vote-reminder": [
    "shareholderName",
    "voteName",
    "voteDescription",
    "deadline",
    "voteUrl",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "vote-result": [
    "shareholderName",
    "voteName",
    "result",
    "resultUrl",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "document-shared": [
    "recipientName",
    "documentTitle",
    "documentCategory",
    "sharedBy",
    "documentUrl",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "settlement-notification": [
    "recipientName",
    "settlementPeriod",
    "parkName",
    "totalAmount",
    "settlementUrl",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "news-announcement": [
    "recipientName",
    "newsTitle",
    "newsExcerpt",
    "newsUrl",
    "publishedAt",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "service-event": [
    "title",
    "message",
    "anomalyCount",
    "criticalCount",
    "warningCount",
    "link",
    "tenantName",
    "appName",
    "currentYear",
  ],
  "report-ready": [
    "reportName",
    "reportTitle",
    "generatedAt",
    "downloadUrl",
    "tenantName",
    "appName",
    "currentYear",
  ],
};

// =============================================================================
// VALIDATION
// =============================================================================

const updateTemplateSchema = z.object({
  subject: z.string().min(1, "Betreff ist erforderlich").max(200),
  htmlContent: z
    .string()
    .min(1, "Inhalt ist erforderlich")
    .max(100000, "Inhalt ist zu lang"),
  isActive: z.boolean().optional(),
});

// =============================================================================
// GET /api/admin/email-templates/[key]
// =============================================================================

export async function GET(
  _request: NextRequest,
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

    // Try to load custom template from DB
    const customTemplate = await prisma.emailTemplate.findUnique({
      where: {
        tenantId_name: {
          tenantId: check.tenantId!,
          name: templateKey,
        },
      },
    });

    if (customTemplate) {
      return NextResponse.json({
        key: templateKey,
        subject: customTemplate.subject,
        htmlContent: customTemplate.htmlContent,
        isActive: customTemplate.isActive,
        isCustomized: true,
        placeholders: TEMPLATE_PLACEHOLDERS[templateKey] || [],
        updatedAt: customTemplate.updatedAt.toISOString(),
      });
    }

    // Fall back to built-in template - render it to get the HTML
    const rendered = await previewTemplate(templateKey, check.tenantId!);

    return NextResponse.json({
      key: templateKey,
      subject: rendered.subject,
      htmlContent: rendered.html,
      isActive: true,
      isCustomized: false,
      placeholders: TEMPLATE_PLACEHOLDERS[templateKey] || [],
      updatedAt: null,
    });
  } catch (error) {
    logger.error({ err: error }, "[Email Templates API] GET [key] error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Vorlage" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/admin/email-templates/[key]
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { key } = await params;

    // Validate template key
    if (!VALID_TEMPLATE_KEYS.includes(key as SupportedTemplateName)) {
      return NextResponse.json(
        { error: "Unbekannte Vorlage" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { subject, htmlContent, isActive } = parsed.data;

    // Auto-generate plain text from HTML
    const textContent = htmlToPlainText(htmlContent);

    // Upsert the template in the DB
    const template = await prisma.emailTemplate.upsert({
      where: {
        tenantId_name: {
          tenantId: check.tenantId!,
          name: key,
        },
      },
      update: {
        subject,
        htmlContent,
        textContent,
        ...(isActive !== undefined && { isActive }),
      },
      create: {
        name: key,
        subject,
        htmlContent,
        textContent,
        isActive: isActive ?? true,
        tenantId: check.tenantId!,
      },
    });

    return NextResponse.json({
      success: true,
      template: {
        key: template.name,
        subject: template.subject,
        isActive: template.isActive,
        isCustomized: true,
        updatedAt: template.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Email Templates API] PUT [key] error");
    return NextResponse.json(
      { error: "Fehler beim Speichern der Vorlage" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/admin/email-templates/[key]
// =============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { key } = await params;

    // Validate template key
    if (!VALID_TEMPLATE_KEYS.includes(key as SupportedTemplateName)) {
      return NextResponse.json(
        { error: "Unbekannte Vorlage" },
        { status: 404 }
      );
    }

    // Delete the custom template - built-in will be used as fallback
    await prisma.emailTemplate.deleteMany({
      where: {
        tenantId: check.tenantId!,
        name: key,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Email Templates API] DELETE [key] error");
    return NextResponse.json(
      { error: "Fehler beim Zuruecksetzen der Vorlage" },
      { status: 500 }
    );
  }
}

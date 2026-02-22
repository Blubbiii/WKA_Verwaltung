/**
 * Email Templates API - List all templates
 *
 * GET - Retrieve all email templates for the current tenant
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { type SupportedTemplateName } from "@/lib/email/renderer";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// TEMPLATE METADATA
// =============================================================================

// All known template types with their display names
const TEMPLATE_DEFINITIONS: Array<{
  key: SupportedTemplateName;
  name: string;
  defaultSubject: string;
}> = [
  {
    key: "welcome",
    name: "Willkommens-E-Mail",
    defaultSubject: "Willkommen bei WindparkManager",
  },
  {
    key: "password-reset",
    name: "Passwort-Reset",
    defaultSubject: "Passwort zuruecksetzen",
  },
  {
    key: "new-invoice",
    name: "Neue Gutschrift",
    defaultSubject: "Neue Gutschrift verfuegbar",
  },
  {
    key: "vote-invitation",
    name: "Abstimmungs-Einladung",
    defaultSubject: "Neue Abstimmung verfuegbar",
  },
  {
    key: "tenant-admin-invitation",
    name: "Administrator-Einladung",
    defaultSubject: "Einladung als Administrator",
  },
  {
    key: "portal-invitation",
    name: "Portal-Einladung",
    defaultSubject: "Ihr Portal-Zugang",
  },
  {
    key: "vote-reminder",
    name: "Abstimmungs-Erinnerung",
    defaultSubject: "Erinnerung: Abstimmung",
  },
  {
    key: "vote-result",
    name: "Abstimmungsergebnis",
    defaultSubject: "Abstimmungsergebnis",
  },
  {
    key: "document-shared",
    name: "Dokument geteilt",
    defaultSubject: "Neues Dokument",
  },
  {
    key: "settlement-notification",
    name: "Pachtabrechnung",
    defaultSubject: "Pachtabrechnung erstellt",
  },
  {
    key: "news-announcement",
    name: "Meldung / Neuigkeit",
    defaultSubject: "Neue Meldung",
  },
  {
    key: "service-event",
    name: "Service-Meldung",
    defaultSubject: "Service-Meldung",
  },
  {
    key: "report-ready",
    name: "Bericht erstellt",
    defaultSubject: "Geplanter Bericht erstellt",
  },
];

// =============================================================================
// GET /api/admin/email-templates
// =============================================================================

export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    // Fetch all custom templates for this tenant from the DB
    const customTemplates = await prisma.emailTemplate.findMany({
      where: { tenantId: check.tenantId! },
      select: {
        name: true,
        subject: true,
        isActive: true,
        updatedAt: true,
      },
    });

    // Build a map of custom templates by name
    const customMap = new Map(
      customTemplates.map((t) => [t.name, t])
    );

    // Merge built-in definitions with custom overrides
    const templates = TEMPLATE_DEFINITIONS.map((def) => {
      const custom = customMap.get(def.key);

      return {
        key: def.key,
        name: def.name,
        subject: custom?.subject || def.defaultSubject,
        isActive: custom?.isActive ?? true,
        isCustomized: !!custom,
        updatedAt: custom?.updatedAt?.toISOString() || null,
      };
    });

    return NextResponse.json({ templates });
  } catch (error) {
    logger.error({ err: error }, "[Email Templates API] GET error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Vorlagen" },
      { status: 500 }
    );
  }
}

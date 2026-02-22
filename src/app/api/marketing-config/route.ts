import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { DEFAULT_MARKETING_CONFIG, DEFAULT_LEGAL_PAGES } from "@/lib/marketing/defaults";

// =============================================================================
// GET /api/marketing-config (PUBLIC - no authentication required)
// Returns the marketing configuration and legal pages for the public website.
// Uses the first active tenant since no auth context is available.
// =============================================================================

export async function GET() {
  try {
    // No auth required - this is a public endpoint for the marketing/landing page.
    // Since we have no tenant context without auth, we load the first active tenant.
    const tenant = await prisma.tenant.findFirst({
      where: { status: "ACTIVE" },
      select: { settings: true },
    });

    if (!tenant) {
      // No tenant found - return defaults
      return NextResponse.json({
        marketing: DEFAULT_MARKETING_CONFIG,
        legalPages: DEFAULT_LEGAL_PAGES,
      });
    }

    // Extract marketing config and legal pages from tenant settings
    const allSettings = (tenant.settings as Record<string, unknown>) || {};
    const storedMarketing = (allSettings.marketing as Record<string, unknown>) || {};
    const storedLegalPages = (allSettings.legalPages as Record<string, unknown>) || {};

    // Deep-merge stored marketing config over defaults
    const marketing = {
      hero: {
        ...DEFAULT_MARKETING_CONFIG.hero,
        ...(storedMarketing.hero as Record<string, unknown> || {}),
      },
      features: storedMarketing.features || DEFAULT_MARKETING_CONFIG.features,
      pricing: {
        ...DEFAULT_MARKETING_CONFIG.pricing,
        ...(storedMarketing.pricing as Record<string, unknown> || {}),
      },
      cta: {
        ...DEFAULT_MARKETING_CONFIG.cta,
        ...(storedMarketing.cta as Record<string, unknown> || {}),
      },
    };

    // Merge legal pages with defaults
    const legalPages = {
      ...DEFAULT_LEGAL_PAGES,
      ...storedLegalPages,
    };

    return NextResponse.json({ marketing, legalPages });
  } catch (error) {
    logger.error({ err: error }, "Error fetching public marketing config");
    return NextResponse.json(
      { error: "Fehler beim Laden der Marketing-Konfiguration" },
      { status: 500 }
    );
  }
}

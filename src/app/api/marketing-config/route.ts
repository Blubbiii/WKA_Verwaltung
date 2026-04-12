import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
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
    const tenant = await prisma.tenant.findFirst({
      where: { status: "ACTIVE" },
      select: { settings: true },
    });

    if (!tenant) {
      return NextResponse.json({
        marketing: DEFAULT_MARKETING_CONFIG,
        legalPages: DEFAULT_LEGAL_PAGES,
      });
    }

    const allSettings = (tenant.settings as Record<string, unknown>) || {};
    const stored = (allSettings.marketing as Record<string, unknown>) || {};
    const storedLegalPages = (allSettings.legalPages as Record<string, unknown>) || {};

    // Deep-merge stored marketing config over defaults for all sections
    const marketing = {
      sections: stored.sections || DEFAULT_MARKETING_CONFIG.sections,
      hero: {
        ...DEFAULT_MARKETING_CONFIG.hero,
        ...(stored.hero as Record<string, unknown> || {}),
      },
      trustBar: {
        ...DEFAULT_MARKETING_CONFIG.trustBar,
        ...(stored.trustBar as Record<string, unknown> || {}),
      },
      features: stored.features || DEFAULT_MARKETING_CONFIG.features,
      showcase: {
        ...DEFAULT_MARKETING_CONFIG.showcase,
        ...(stored.showcase as Record<string, unknown> || {}),
      },
      stats: {
        ...DEFAULT_MARKETING_CONFIG.stats,
        ...(stored.stats as Record<string, unknown> || {}),
      },
      workflow: {
        ...DEFAULT_MARKETING_CONFIG.workflow,
        ...(stored.workflow as Record<string, unknown> || {}),
      },
      modules: {
        ...DEFAULT_MARKETING_CONFIG.modules,
        ...(stored.modules as Record<string, unknown> || {}),
      },
      pricing: {
        ...DEFAULT_MARKETING_CONFIG.pricing,
        ...(stored.pricing as Record<string, unknown> || {}),
      },
      testimonials: {
        ...DEFAULT_MARKETING_CONFIG.testimonials,
        ...(stored.testimonials as Record<string, unknown> || {}),
      },
      cta: {
        ...DEFAULT_MARKETING_CONFIG.cta,
        ...(stored.cta as Record<string, unknown> || {}),
      },
    };

    const legalPages = {
      ...DEFAULT_LEGAL_PAGES,
      ...storedLegalPages,
    };

    return NextResponse.json({ marketing, legalPages });
  } catch (error) {
    logger.error({ err: error }, "Error fetching public marketing config");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Marketing-Konfiguration" });
  }
}

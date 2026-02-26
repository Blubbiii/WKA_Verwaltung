/**
 * Mailings API
 *
 * GET  /api/mailings — List all mailings
 * POST /api/mailings — Create a new mailing (template-based or free-form)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Validation
// =============================================================================

const recipientFilterSchema = z.object({
  type: z.enum(["ALL", "BY_FUND", "BY_PARK", "BY_ROLE", "ACTIVE_ONLY"]),
  fundIds: z.array(z.string()).optional(),
  parkIds: z.array(z.string()).optional(),
}).optional();

const createTemplateSchema = z.object({
  contentSource: z.literal("TEMPLATE"),
  templateId: z.string().min(1),
  title: z.string().min(1).max(300),
  recipientFilter: recipientFilterSchema,
});

const createFreeformSchema = z.object({
  contentSource: z.literal("FREEFORM"),
  title: z.string().min(1).max(300),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  recipientFilter: recipientFilterSchema,
});

// Legacy schema for backward compatibility (existing wizard sends without contentSource)
const createLegacySchema = z.object({
  templateId: z.string().min(1),
  fundId: z.string().optional(),
  title: z.string().min(1).max(300),
});

// =============================================================================
// GET /api/mailings
// =============================================================================

export async function GET(req: NextRequest) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  const enabled = await getConfigBoolean("communication.enabled", check.tenantId, false);
  if (!enabled) return NextResponse.json({ error: "Communication module is not enabled" }, { status: 404 });

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));

    const [mailings, total] = await Promise.all([
      prisma.mailing.findMany({
        where: { tenantId: check.tenantId! },
        include: {
          template: { select: { name: true, category: true } },
          fund: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.mailing.count({ where: { tenantId: check.tenantId! } }),
    ]);

    return NextResponse.json({
      mailings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "[Mailings] GET failed");
    return NextResponse.json({ error: "Fehler beim Laden der Mailings" }, { status: 500 });
  }
}

// =============================================================================
// POST /api/mailings
// =============================================================================

export async function POST(req: NextRequest) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  const enabledPost = await getConfigBoolean("communication.enabled", check.tenantId, false);
  if (!enabledPost) return NextResponse.json({ error: "Communication module is not enabled" }, { status: 404 });

  try {
    const body = await req.json();

    // Try new unified schema first, fall back to legacy
    const templateParse = createTemplateSchema.safeParse(body);
    const freeformParse = createFreeformSchema.safeParse(body);
    const legacyParse = createLegacySchema.safeParse(body);

    if (templateParse.success) {
      const data = templateParse.data;

      // Verify template belongs to tenant
      const template = await prisma.mailingTemplate.findFirst({
        where: { id: data.templateId, tenantId: check.tenantId! },
      });
      if (!template) {
        return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 });
      }

      const mailing = await prisma.mailing.create({
        data: {
          tenantId: check.tenantId!,
          templateId: data.templateId,
          title: data.title,
          contentSource: "TEMPLATE",
          recipientFilter: data.recipientFilter ?? undefined,
          status: "DRAFT",
          createdBy: check.userId,
        },
        include: {
          template: { select: { name: true, category: true } },
          fund: { select: { name: true } },
        },
      });

      return NextResponse.json({ mailing }, { status: 201 });
    }

    if (freeformParse.success) {
      const data = freeformParse.data;

      const mailing = await prisma.mailing.create({
        data: {
          tenantId: check.tenantId!,
          title: data.title,
          contentSource: "FREEFORM",
          subject: data.subject,
          bodyHtml: data.bodyHtml,
          recipientFilter: data.recipientFilter ?? undefined,
          status: "DRAFT",
          createdBy: check.userId,
        },
        include: {
          template: { select: { name: true, category: true } },
          fund: { select: { name: true } },
        },
      });

      return NextResponse.json({ mailing }, { status: 201 });
    }

    if (legacyParse.success) {
      // Legacy format: { templateId, fundId?, title }
      const data = legacyParse.data;

      const template = await prisma.mailingTemplate.findFirst({
        where: { id: data.templateId, tenantId: check.tenantId! },
      });
      if (!template) {
        return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 });
      }

      if (data.fundId) {
        const fund = await prisma.fund.findFirst({
          where: { id: data.fundId, tenantId: check.tenantId! },
        });
        if (!fund) {
          return NextResponse.json({ error: "Gesellschaft nicht gefunden" }, { status: 404 });
        }
      }

      const mailing = await prisma.mailing.create({
        data: {
          tenantId: check.tenantId!,
          templateId: data.templateId,
          fundId: data.fundId ?? null,
          title: data.title,
          contentSource: "TEMPLATE",
          status: "DRAFT",
          createdBy: check.userId,
        },
        include: {
          template: { select: { name: true, category: true } },
          fund: { select: { name: true } },
        },
      });

      return NextResponse.json({ mailing }, { status: 201 });
    }

    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Eingabe", details: error.errors }, { status: 400 });
    }
    logger.error({ err: error }, "[Mailings] POST failed");
    return NextResponse.json({ error: "Fehler beim Erstellen" }, { status: 500 });
  }
}

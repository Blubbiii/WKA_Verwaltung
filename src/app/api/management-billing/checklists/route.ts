/**
 * Operational Checklists API - List and Create
 *
 * GET  - List checklists with filters (parkId, isActive, search)
 * POST - Create a new checklist template
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const checklistCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullish(),
  items: z.array(z.any()).min(0),
  recurrence: z.string().nullish(),
  parkId: z.string().nullish(),
  isActive: z.boolean().optional().default(true),
});

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/checklists
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    if (!check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Mandanten-Kontext erforderlich" });
    }

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const isActive = searchParams.get("isActive");
    const search = searchParams.get("search");

    const where: Prisma.OperationalChecklistWhereInput = {
      tenantId: check.tenantId,
    };

    if (parkId) where.parkId = parkId;
    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const checklists = await prisma.operationalChecklist.findMany({
      where,
      include: {
        park: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { title: "asc" },
    });

    return NextResponse.json({ checklists });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET checklists error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Checklisten" });
  }
}

// =============================================================================
// POST /api/management-billing/checklists
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:create");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    if (!check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Mandanten-Kontext erforderlich" });
    }

    const body = await request.json();
    const parsed = checklistCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { title, description, items, recurrence, parkId, isActive } = parsed.data;

    const checklist = await prisma.operationalChecklist.create({
      data: {
        tenantId: check.tenantId,
        title: title.trim(),
        description: description || null,
        items,
        recurrence: recurrence || null,
        parkId: parkId || null,
        isActive,
      },
      include: {
        park: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    });

    logger.info(
      { checklistId: checklist.id, title: checklist.title, tenantId: check.tenantId },
      "[Management-Billing] Checklist created"
    );

    return NextResponse.json({ checklist }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] POST checklist error");
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen der Checkliste" });
  }
}

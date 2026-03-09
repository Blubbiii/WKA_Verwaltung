/**
 * Operational Checklists API - List and Create
 *
 * GET  - List checklists with filters (parkId, isActive, search)
 * POST - Create a new checklist template
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
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
      return NextResponse.json(
        { error: "Mandanten-Kontext erforderlich" },
        { status: 403 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Checklisten" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Mandanten-Kontext erforderlich" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { title, description, items, recurrence, parkId, isActive } = body;

    // Validation
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "title ist erforderlich" },
        { status: 400 }
      );
    }

    if (title.length > 200) {
      return NextResponse.json(
        { error: "title darf maximal 200 Zeichen lang sein" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "items ist erforderlich und muss ein Array sein" },
        { status: 400 }
      );
    }

    const checklist = await prisma.operationalChecklist.create({
      data: {
        tenantId: check.tenantId,
        title: title.trim(),
        description: description || null,
        items,
        recurrence: recurrence || null,
        parkId: parkId || null,
        isActive: isActive !== undefined ? isActive : true,
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
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Checkliste" },
      { status: 500 }
    );
  }
}

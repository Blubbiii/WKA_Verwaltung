/**
 * Operational Tasks API - List and Create
 *
 * GET  - List tasks with filters (status, parkId, turbineId, assignedToId, taskType, search)
 * POST - Create a new operational task
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma, OperationalTaskStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { parsePaginationParams } from "@/lib/api-utils";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/tasks
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
    const status = searchParams.get("status");
    const parkId = searchParams.get("parkId");
    const turbineId = searchParams.get("turbineId");
    const assignedToId = searchParams.get("assignedToId");
    const taskType = searchParams.get("taskType");
    const search = searchParams.get("search");
    const { page, limit, skip } = parsePaginationParams(searchParams, { defaultLimit: 50 });

    const where: Prisma.OperationalTaskWhereInput = {
      tenantId: check.tenantId,
    };

    if (status) where.status = status as OperationalTaskStatus;
    if (parkId) where.parkId = parkId;
    if (turbineId) where.turbineId = turbineId;
    if (assignedToId) where.assignedToId = assignedToId;

    // Default to OPERATIONAL if no taskType filter provided
    where.taskType = taskType || "OPERATIONAL";

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

    const [tasks, total] = await Promise.all([
      prisma.operationalTask.findMany({
        where,
        include: {
          park: { select: { id: true, name: true } },
          turbine: { select: { id: true, designation: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          checklist: { select: { id: true, title: true } },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.operationalTask.count({ where }),
    ]);

    const enriched = tasks.map((t) => ({
      ...t,
      costEstimateEur: t.costEstimateEur ? Number(t.costEstimateEur) : null,
      actualCostEur: t.actualCostEur ? Number(t.actualCostEur) : null,
    }));

    return NextResponse.json({
      tasks: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET tasks error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Aufgaben" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/management-billing/tasks
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

    const {
      title,
      description,
      status,
      priority,
      taskType,
      category,
      dueDate,
      notes,
      checklistData,
      parkId,
      turbineId,
      checklistId,
      assignedToId,
      costEstimateEur,
      actualCostEur,
      benefitNotes,
    } = body;

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

    // Validate status if provided
    const validStatuses: OperationalTaskStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Ungueltiger Status. Erlaubt: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const task = await prisma.operationalTask.create({
      data: {
        tenantId: check.tenantId,
        title: title.trim(),
        description: description || null,
        status: status || "OPEN",
        priority: priority ?? 2,
        taskType: taskType || "OPERATIONAL",
        category: category || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        completedAt: status === "DONE" ? new Date() : null,
        notes: notes || null,
        checklistData: checklistData || null,
        parkId: parkId || null,
        turbineId: turbineId || null,
        checklistId: checklistId || null,
        assignedToId: assignedToId || null,
        costEstimateEur: costEstimateEur ?? null,
        actualCostEur: actualCostEur ?? null,
        benefitNotes: benefitNotes || null,
        createdById: check.userId!,
      },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        checklist: { select: { id: true, title: true } },
      },
    });

    logger.info(
      { taskId: task.id, title: task.title, tenantId: check.tenantId },
      "[Management-Billing] Task created"
    );

    return NextResponse.json(
      {
        task: {
          ...task,
          costEstimateEur: task.costEstimateEur ? Number(task.costEstimateEur) : null,
          actualCostEur: task.actualCostEur ? Number(task.actualCostEur) : null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] POST task error");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Aufgabe" },
      { status: 500 }
    );
  }
}

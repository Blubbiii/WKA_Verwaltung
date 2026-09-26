/**
 * Operational Tasks API - List and Create
 *
 * GET  - List tasks with filters (status, parkId, turbineId, assignedToId, taskType, search)
 * POST - Create a new operational task
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { verweisePruefen } from "@/lib/management-billing/verweise";
import { getConfigBoolean } from "@/lib/config";
import { Prisma } from "@prisma/client";

import { apiLogger as logger } from "@/lib/logger";
import { parsePaginationParams } from "@/lib/api-utils";
import { enumParam } from "@/lib/validation/query-params";
import { taskCreateSchema } from "@/lib/management-billing/task-schemas";

const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
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
      return apiError("FORBIDDEN", 403, { message: "Mandanten-Kontext erforderlich" });
    }
    const db = mandantDb(check.tenantId!);

    const { searchParams } = new URL(request.url);
    const status = enumParam(searchParams.get("status"), TASK_STATUSES);
    const parkId = searchParams.get("parkId");
    const turbineId = searchParams.get("turbineId");
    const assignedToId = searchParams.get("assignedToId");
    const taskType = searchParams.get("taskType");
    const search = searchParams.get("search");
    const { page, limit, skip } = parsePaginationParams(searchParams, { defaultLimit: 50,
      // 200 statt der Vorgabe 100 — die Aufgabenliste wird vollstaendig
      // geladen und clientseitig gefiltert. Bei 100 fehlten Aufgaben,
      // ohne dass es auffiele.
      maxLimit: 200,
    });

    const where: Prisma.OperationalTaskWhereInput = {
      tenantId: check.tenantId,
    };

    if (status) where.status = status;
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
      db.operationalTask.findMany({
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
      db.operationalTask.count({ where }),
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
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Aufgaben" });
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
      return apiError("FORBIDDEN", 403, { message: "Mandanten-Kontext erforderlich" });
    }
    const db = mandantDb(check.tenantId!);

    const body = await request.json();
    const parsed = taskCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { title, description, status, priority, taskType, category, dueDate, notes, checklistData, parkId, turbineId, checklistId, assignedToId, costEstimateEur, actualCostEur, benefitNotes } = parsed.data;
    const verweisFehler = await verweisePruefen(check.tenantId!, { parkId, turbineId, assignedToId, checklistId });
    if (verweisFehler) return verweisFehler;

    const task = await db.operationalTask.create({
      data: {
        tenantId: check.tenantId,
        title: title.trim(),
        description: description || null,
        status,
        priority,
        taskType,
        category: category || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        completedAt: status === "DONE" ? new Date() : null,
        notes: notes || null,
        // JSON-Column: SQL NULL = Prisma.DbNull (Prisma erlaubt JS null nicht direkt).
        checklistData: checklistData && checklistData.length > 0 ? checklistData : Prisma.DbNull,
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
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen der Aufgabe" });
  }
}

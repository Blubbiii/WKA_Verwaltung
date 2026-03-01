import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

// ============================================================================
// Validation
// ============================================================================

const activitySchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "TASK"]),
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  status: z.enum(["DONE", "PENDING", "CANCELLED"]).default("DONE"),
  direction: z.enum(["INBOUND", "OUTBOUND"]).optional().nullable(),
  duration: z.number().int().positive().optional().nullable(),
  startTime: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  personId: z.string().uuid().optional().nullable(),
  fundId: z.string().uuid().optional().nullable(),
  leaseId: z.string().uuid().optional().nullable(),
  parkId: z.string().uuid().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
}).refine(
  (d) => d.personId || d.fundId || d.leaseId || d.parkId,
  { message: "Mindestens eine Entität muss verknüpft sein" }
);

// ============================================================================
// GET /api/crm/activities
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const personId = searchParams.get("personId");
    const fundId = searchParams.get("fundId");
    const leaseId = searchParams.get("leaseId");
    const parkId = searchParams.get("parkId");
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const year = searchParams.get("year");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

    const where: Record<string, unknown> = {
      tenantId: check.tenantId,
      deletedAt: null,
    };

    if (personId) where.personId = personId;
    if (fundId) where.fundId = fundId;
    if (leaseId) where.leaseId = leaseId;
    if (parkId) where.parkId = parkId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (year) {
      where.createdAt = {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${parseInt(year) + 1}-01-01`),
      };
    }

    const activities = await prisma.crmActivity.findMany({
      where,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        person: { select: { id: true, firstName: true, lastName: true } },
        fund: { select: { id: true, name: true } },
        lease: { select: { id: true, lessor: { select: { firstName: true, lastName: true } } } },
        park: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(serializePrisma(activities));
  } catch (error) {
    logger.error({ err: error }, "Error fetching CRM activities");
    return NextResponse.json({ error: "Fehler beim Laden der Aktivitäten" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/crm/activities
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("crm:create");
    if (!check.authorized) return check.error;

    const raw = await request.json();
    const parsed = activitySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const activity = await prisma.crmActivity.create({
      data: {
        tenantId: check.tenantId!,
        createdById: check.userId!,
        type: data.type,
        title: data.title,
        description: data.description ?? null,
        status: data.status,
        direction: data.direction ?? null,
        duration: data.duration ?? null,
        startTime: data.startTime ? new Date(data.startTime) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        personId: data.personId ?? null,
        fundId: data.fundId ?? null,
        leaseId: data.leaseId ?? null,
        parkId: data.parkId ?? null,
        assignedToId: data.assignedToId ?? null,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Update lastActivityAt on linked entity
    const now = new Date();
    if (data.personId) {
      await prisma.person.update({ where: { id: data.personId }, data: { lastActivityAt: now } });
    }
    if (data.fundId) {
      await prisma.fund.update({ where: { id: data.fundId }, data: { lastActivityAt: now } });
    }
    if (data.leaseId) {
      await prisma.lease.update({ where: { id: data.leaseId }, data: { lastActivityAt: now } });
    }

    logger.info({ tenantId: check.tenantId, activityId: activity.id }, "CRM activity created");
    return NextResponse.json(serializePrisma(activity), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating CRM activity");
    return NextResponse.json({ error: "Fehler beim Erstellen der Aktivität" }, { status: 500 });
  }
}

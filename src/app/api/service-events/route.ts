import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";

const serviceEventSchema = z.object({
  turbineId: z.string().uuid("Ungültige Anlagen-ID"),
  eventDate: z.string(),
  eventType: z.string().min(1, "Typ ist erforderlich"),
  description: z.string().optional(),
  durationHours: z.number().optional(),
  cost: z.number().optional(),
  performedBy: z.string().optional(),
  notes: z.string().optional(),
});

// Erlaubte Sortierfelder
const ALLOWED_SORT_FIELDS: Record<string, string> = {
  eventDate: "eventDate",
  eventType: "eventType",
  cost: "cost",
  durationHours: "durationHours",
  performedBy: "performedBy",
  createdAt: "createdAt",
};

// GET /api/service-events - Liste aller Service-Events
export async function GET(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.PARKS_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const turbineId = searchParams.get("turbineId");
    const eventType = searchParams.get("eventType");
    const parkId = searchParams.get("parkId");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const sortBy = searchParams.get("sortBy") || "eventDate";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any


    const where: any = {
      turbine: {
        park: {
          tenantId: check.tenantId,
          ...(parkId && { id: parkId }),
        },
      },
      ...(turbineId && { turbineId }),
      ...(eventType && { eventType }),
    };

    // Datumsfilter
    if (dateFrom || dateTo) {
      where.eventDate = {};
      if (dateFrom) {
        where.eventDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.eventDate.lte = new Date(dateTo);
      }
    }

    // Suchfilter (description, performedBy, notes)
    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { performedBy: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    // Sortierung validieren
    const validSortField = ALLOWED_SORT_FIELDS[sortBy] || "eventDate";
    const validSortOrder = sortOrder === "asc" ? "asc" : "desc";

    // Tenant-weite Basis-Where-Bedingung für Aggregationen
    const baseWhere = {
      turbine: {
        park: {
          tenantId: check.tenantId,
        },
      },
    };

    // Beginn des aktuellen Monats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [events, total, totalCostResult, monthCount, upcomingCount] =
      await Promise.all([
        prisma.serviceEvent.findMany({
          where,
          include: {
            turbine: {
              select: {
                id: true,
                designation: true,
                park: {
                  select: { id: true, name: true, shortName: true },
                },
              },
            },
            createdBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { [validSortField]: validSortOrder },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.serviceEvent.count({ where }),
        prisma.serviceEvent.aggregate({
          where: baseWhere,
          _sum: { cost: true },
        }),
        prisma.serviceEvent.count({
          where: {
            ...baseWhere,
            eventDate: { gte: monthStart },
          },
        }),
        prisma.serviceEvent.count({
          where: {
            ...baseWhere,
            eventDate: { gt: now },
          },
        }),
      ]);

    return NextResponse.json({
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        totalCount: total,
        monthCount,
        totalCost: totalCostResult._sum.cost
          ? Number(totalCostResult._sum.cost)
          : 0,
        upcomingCount,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching service events");
    return NextResponse.json(
      { error: "Fehler beim Laden der Service-Events" },
      { status: 500 }
    );
  }
}

// POST /api/service-events - Service-Event erstellen
export async function POST(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.PARKS_UPDATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = serviceEventSchema.parse(body);

    // Prüfe ob Anlage zum Tenant gehört
    const turbine = await prisma.turbine.findFirst({
      where: {
        id: validatedData.turbineId,
        park: {
          tenantId: check.tenantId,
        },
      },
    });

    if (!turbine) {
      return NextResponse.json(
        { error: "Anlage nicht gefunden" },
        { status: 404 }
      );
    }

    const event = await prisma.serviceEvent.create({
      data: {
        turbineId: validatedData.turbineId,
        eventDate: new Date(validatedData.eventDate),
        eventType: validatedData.eventType,
        description: validatedData.description,
        durationHours: validatedData.durationHours,
        cost: validatedData.cost,
        performedBy: validatedData.performedBy,
        notes: validatedData.notes,
        createdById: check.userId,
      },
      include: {
        turbine: {
          select: { id: true, designation: true },
        },
      },
    });

    // Fire-and-forget webhook dispatch
    dispatchWebhook(check.tenantId!, "service_event.created", {
      id: event.id,
      type: event.eventType,
      description: event.description,
    }).catch(() => {});

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating service event");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Service-Events" },
      { status: 500 }
    );
  }
}

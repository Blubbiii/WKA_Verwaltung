import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { logDeletion } from "@/lib/audit";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const serviceEventUpdateSchema = z.object({
  eventDate: z.string().optional(),
  eventType: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  durationHours: z.number().optional().nullable(),
  cost: z.number().optional().nullable(),
  performedBy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/service-events/[id] - Service-Event Details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PARKS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const event = await prisma.serviceEvent.findFirst({
      where: {
        id,
        turbine: {
          park: {
            tenantId: check.tenantId,
          },
        },
      },
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
        documents: {
          where: { isArchived: false },
          select: {
            id: true,
            title: true,
            category: true,
            fileName: true,
            fileUrl: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { documents: true },
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Service-Event nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(event);
  } catch (error) {
    logger.error({ err: error }, "Error fetching service event");
    return NextResponse.json(
      { error: "Fehler beim Laden des Service-Events" },
      { status: 500 }
    );
  }
}

// PUT /api/service-events/[id] - Service-Event aktualisieren
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PARKS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify event belongs to tenant
    const existingEvent = await prisma.serviceEvent.findFirst({
      where: {
        id,
        turbine: {
          park: {
            tenantId: check.tenantId,
          },
        },
      },
    });

    if (!existingEvent) {
      return NextResponse.json(
        { error: "Service-Event nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = serviceEventUpdateSchema.parse(body);

    const event = await prisma.serviceEvent.update({
      where: { id },
      data: {
        ...(validatedData.eventDate && {
          eventDate: new Date(validatedData.eventDate),
        }),
        ...(validatedData.eventType && { eventType: validatedData.eventType }),
        description: validatedData.description,
        durationHours: validatedData.durationHours,
        cost: validatedData.cost,
        performedBy: validatedData.performedBy,
        notes: validatedData.notes,
      },
      include: {
        turbine: {
          select: { id: true, designation: true },
        },
      },
    });

    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating service event");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Service-Events" },
      { status: 500 }
    );
  }
}

// DELETE /api/service-events/[id] - Service-Event unwiderruflich löschen (Hard-Delete)
// Nur ADMIN und SUPERADMIN dürfen löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PARKS_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify event belongs to tenant
    const event = await prisma.serviceEvent.findFirst({
      where: {
        id,
        turbine: {
          park: {
            tenantId: check.tenantId,
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Service-Event nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.serviceEvent.delete({
      where: { id },
    });

    // Log deletion for audit trail
    await logDeletion("ServiceEvent", id, event);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting service event");
    return NextResponse.json(
      { error: "Fehler beim Löschen des Service-Events" },
      { status: 500 }
    );
  }
}

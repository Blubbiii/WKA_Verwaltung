import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const updateSchema = z.object({
  salutation: z.string().max(20).optional().nullable(),
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  mobile: z.string().max(50).optional().nullable(),
  street: z.string().max(200).optional().nullable(),
  houseNumber: z.string().max(20).optional().nullable(),
  postalCode: z.string().max(10).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional(),
  contactType: z.string().max(50).optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/crm/contacts/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return NextResponse.json({ error: "CRM nicht aktiviert" }, { status: 404 });
    const { id } = await params;

    const person = await prisma.person.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        crmActivities: {
          where: { deletedAt: null },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        shareholders: {
          include: { fund: { select: { id: true, name: true, legalForm: true } } },
        },
        leases: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: "Kontakt nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json(serializePrisma(person));
  } catch (error) {
    logger.error({ err: error }, "Error fetching CRM contact");
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

// PUT /api/crm/contacts/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:update");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return NextResponse.json({ error: "CRM nicht aktiviert" }, { status: 404 });
    const { id } = await params;

    const existing = await prisma.person.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return NextResponse.json({ error: "Kontakt nicht gefunden" }, { status: 404 });
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    // Build update data from all provided fields
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) {
        // Treat empty string email as null
        updateData[key] = key === "email" && value === "" ? null : value;
      }
    }

    const updated = await prisma.person.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating CRM contact");
    return NextResponse.json({ error: "Fehler beim Aktualisieren" }, { status: 500 });
  }
}

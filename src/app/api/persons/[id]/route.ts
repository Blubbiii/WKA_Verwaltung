import { NextRequest, NextResponse, after } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { logDeletion } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

const personUpdateSchema = z.object({
  personType: z.enum(["natural", "legal"]).optional(),
  salutation: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  email: z.email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  houseNumber: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional(),
  taxId: z.string().optional().nullable(),
  bankIban: z.string().optional().nullable(),
  bankBic: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  preferredDeliveryMethod: z.enum(["EMAIL", "POST", "BOTH"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

// GET /api/persons/[id] - Einzelne Person abrufen
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const person = await prisma.person.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        shareholders: {
          include: {
            fund: {
              select: { id: true, name: true },
            },
          },
        },
        leases: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
        contracts: {
          select: {
            id: true,
            title: true,
            contractType: true,
            status: true,
          },
        },
      },
    });

    if (!person) {
      return apiError("NOT_FOUND", undefined, { message: "Person nicht gefunden" });
    }

    return NextResponse.json(person);
  } catch (error) {
    logger.error({ err: error }, "Error fetching person");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Person" });
  }
}

// PATCH /api/persons/[id] - Person aktualisieren
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingPerson = await prisma.person.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!existingPerson) {
      return apiError("NOT_FOUND", undefined, { message: "Person nicht gefunden" });
    }

    const body = await request.json();
    const validatedData = personUpdateSchema.parse(body);

    // Validierung: Name erforderlich
    const personType = validatedData.personType || existingPerson.personType;
    if (personType === "natural") {
      const lastName = validatedData.lastName !== undefined
        ? validatedData.lastName
        : existingPerson.lastName;
      if (!lastName) {
        return apiError("MISSING_FIELD", undefined, { message: "Nachname ist erforderlich" });
      }
    } else {
      const companyName = validatedData.companyName !== undefined
        ? validatedData.companyName
        : existingPerson.companyName;
      if (!companyName) {
        return apiError("MISSING_FIELD", undefined, { message: "Firmenname ist erforderlich" });
      }
    }

    const person = await prisma.person.update({
      where: { id, tenantId: check.tenantId! },
      data: {
        ...validatedData,
        email: validatedData.email || null,
      },
    });

    return NextResponse.json(person);
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Person");
  }
}

// DELETE /api/persons/[id] - Person unwiderruflich löschen (nur ADMIN/SUPERADMIN)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.LEASES_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingPerson = await prisma.person.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        _count: {
          select: {
            shareholders: true,
            leases: true,
            contracts: true,
          },
        },
      },
    });

    if (!existingPerson) {
      return apiError("NOT_FOUND", undefined, { message: "Person nicht gefunden" });
    }

    // Pruefe ob Person noch verwendet wird
    const totalReferences =
      existingPerson._count.shareholders +
      existingPerson._count.leases +
      existingPerson._count.contracts;

    if (totalReferences > 0) {
      return apiError("BAD_REQUEST", undefined, { message: `Person kann nicht gelöscht werden, da sie noch verwendet wird (${existingPerson._count.shareholders} Beteiligungen, ${existingPerson._count.leases} Pachtverträge, ${existingPerson._count.contracts} Verträge)` });
    }

    // Hard-delete: Person unwiderruflich löschen
    await prisma.person.delete({ where: { id, tenantId: check.tenantId! } });

    // Log deletion for audit trail (deferred: runs after response is sent)
    const personSnapshot = existingPerson;
    after(async () => {
      await logDeletion("Person", id, personSnapshot);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting person");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Person" });
  }
}
